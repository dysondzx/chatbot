const http = require('http');
const mysql = require('mysql2/promise');
const url = require('url');
const querystring = require('querystring');

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
 * 处理API请求
 */
async function handleApiRequest(req, res) {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;
  
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 获取聊天记录
  if (pathname === '/api/messages' && req.method === 'GET') {
    try {
      const [rows] = await pool.query(
        'SELECT message_id as id, content, type FROM chat_messages ORDER BY created_at ASC'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
    } catch (error) {
      console.error('获取聊天记录失败:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取聊天记录失败' }));
    }
    return;
  }
  
  // 保存聊天记录
  if (pathname === '/api/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { id, content, type } = data;
        
        if (!id || !content || !type) {
          throw new Error('缺少必要参数');
        }
        
        await pool.query(
          'INSERT INTO chat_messages (message_id, content, type) VALUES (?, ?, ?)',
          [id, content, type]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('保存聊天记录失败:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '保存聊天记录失败' }));
      }
    });
    return;
  }
  
  // 未找到路由
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: '路由不存在' }));
}

/**
 * 创建并启动HTTP服务器
 */
async function startServer() {
  // 初始化数据库连接
  await initDatabase();
  
  // 创建HTTP服务器
  const server = http.createServer(handleApiRequest);
  
  // 监听端口
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Node.js服务运行在 http://localhost:${PORT}`);
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