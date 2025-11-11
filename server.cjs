const express = require('express');
const mysql = require('mysql2/promise');

// 创建Express应用实例
const app = express();

// 从环境变量获取API配置
require('dotenv').config();
const apiKey = process.env.VITE_API_KEY;
const apiBaseUrl = process.env.VITE_API_BASE_URL;
const model = process.env.VITE_MODEL || "moonshot-v1-8k";

// 数据库连接配置 - 从环境变量获取
const dbConfig = {
  host: process.env.DB_HOST || 'localhost', // 数据库主机地址，默认为localhost
  user: process.env.DB_USER || 'root', // 数据库用户名，默认为root
  password: process.env.DB_PASSWORD || '', // 数据库密码
  database: process.env.DB_NAME || 'chatbot_db' // 数据库名称，默认为chatbot_db
};

// 创建数据库连接池
let pool;

/**
 * 初始化数据库连接
 */
async function initDatabase() {
  try {
    // 创建连接池
    pool = mysql.createPool(dbConfig);
    
    // 测试连接
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    connection.release();
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    process.exit(1);
  }
}

/**
 * 获取聊天记录
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function getMessages(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT message_id as id, content, type FROM chat_messages ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('获取聊天记录失败:', error.message);
    res.status(500).json({ error: '获取聊天记录失败' });
  }
}

/**
 * 处理AI聊天请求，调用Kimi API
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function handleChatRequest(req, res) {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: '缺少消息内容' });
    }
    
    // 设置响应头，启用流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 构建请求体
    const requestBody = {
      model: model,
      messages: [
        { role: "user", content: message }
      ],
      stream: true, // 启用流式响应
      temperature: 0.7
    };
    
    // 构建完整的API URL
    const apiUrl = `${apiBaseUrl}/chat/completions`;
    
    // 使用fetch发送POST请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30秒超时
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 获取响应体的可读流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    // 处理SSE格式的流式响应
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // 解码接收到的数据
      const chunk = decoder.decode(value, { stream: true });
      
      // 处理SSE格式的响应块
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          // 处理流结束标志
          if (data === '[DONE]') {
            break;
          }
          
          try {
            // 解析JSON数据
            const parsedData = JSON.parse(data);
            
            // 提取内容并发送给客户端
            if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta) {
              const content = parsedData.choices[0].delta.content || '';
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            }
          } catch (jsonError) {
            console.error('解析JSON失败:', jsonError, '原始数据:', data);
          }
        }
      }
      
      // 确保数据被发送到客户端
      await new Promise(resolve => setImmediate(resolve));
    }
    
    // 结束流式响应
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    console.error('AI聊天请求错误:', error);
    // 如果响应还没有开始发送，则发送错误响应
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // 如果已经开始流式响应，则发送错误事件
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}

/**
 * 保存聊天记录
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function saveMessage(req, res) {
  try {
    const { id, content, type } = req.body;
    
    if (!id || !content || !type) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    await pool.query(
      'INSERT INTO chat_messages (message_id, content, type) VALUES (?, ?, ?)',
      [id, content, type]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('保存聊天记录失败:', error.message);
    res.status(500).json({ error: '保存聊天记录失败' });
  }
}

/**
 * 初始化Express应用
 */
function setupExpress() {
  // 解析JSON请求体
  app.use(express.json());
  
  // 设置CORS中间件
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });
  
  // 定义API路由
  app.get('/api/messages', getMessages);
  app.post('/api/messages', saveMessage);
  app.post('/api/chat', handleChatRequest);
  
  // 404处理
  app.use((req, res) => {
    res.status(404).json({ error: '路由不存在' });
  });
}

/**
 * 启动Express服务器
 */
async function startServer() {
  // 初始化数据库连接
  await initDatabase();
  
  // 设置Express应用
  setupExpress();
  
  // 监听端口
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`Express服务运行在 http://localhost:${PORT}`);
  });
  
  // 处理服务器关闭
  process.on('SIGINT', () => {
    console.log('关闭服务器...');
    pool.end();
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  });
}

// 启动服务器
startServer();