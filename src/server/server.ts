import express from 'express';
import { mcpMiddleware } from '../mcp/index.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 基础中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS 处理
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP 端点 - 使用我们的 MCP 中间件
app.use('/mcp', mcpMiddleware);

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 启动服务器
export function startServer() {
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 MCP Server running on http://127.0.0.1:${PORT}`);
      console.log(`📡 MCP endpoint available at http://127.0.0.1:${PORT}/mcp`);
      resolve();
    });

    server.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });
  });
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  startServer().catch(console.error);
}

export { app };