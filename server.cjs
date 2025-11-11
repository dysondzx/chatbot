const express = require('express');
const mysql = require('mysql2/promise');

// 创建Express应用实例
const app = express();

// 数据库连接配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '123456', // 请根据实际情况修改密码
  database: 'chatbot_db'
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