import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { middlewareService } from './middleware';

const INJECTION_SCRIPT = `
<script>
(function() {
    // 建立 WebSocket 连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host + '/console-log');
    
    // 保存原始 console 方法
    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug
    };
    
    // 发送日志到服务器
    function sendLog(level, args) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: 'log',
                    level: level,
                    message: args.map(arg => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg, null, 2);
                            } catch (e) {
                                return String(arg);
                            }
                        }
                        return String(arg);
                    }).join(' '),
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                }));
            } catch (err) {
                console.error('[日志系统] 发送失败:', err);
            }
        }
    }
    
    // 重写 console 方法
    Object.keys(originalConsole).forEach(level => {
        console[level] = function(...args) {
            originalConsole[level].apply(console, args);
            sendLog(level, args);
        };
    });
    
    // 监听未捕获的错误
    window.addEventListener('error', (event) => {
        sendLog('error', [
            'Uncaught Error: ' + event.message,
            'File: ' + event.filename,
            'Line: ' + event.lineno + ':' + event.colno
        ]);
    });
    
    // 监听未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (event) => {
        sendLog('error', [
            'Unhandled Promise Rejection: ' + (event.reason || 'Unknown reason')
        ]);
    });
    
    // WebSocket 事件处理
    ws.onopen = () => {
        // console.log('[日志系统] WebSocket 连接已建立');
    };
    
    ws.onerror = (err) => {
        console.error('[日志系统] WebSocket 错误:', err);
    };
    
    ws.onclose = () => {
        // console.warn('[日志系统] WebSocket 连接已关闭');
    };
})();
</script>
`;

export class ConsoleLogService {
    private wss: WebSocketServer | undefined;

    public startup(server: Server) {
        this.wss = new WebSocketServer({ noServer: true });
        
        server.on('upgrade', (request, socket, head) => {
            const pathname = new URL(request.url || '', 'http://base').pathname;
            
            if (pathname === '/console-log') {
                this.wss?.handleUpgrade(request, socket, head, (ws) => {
                    this.wss?.emit('connection', ws, request);
                });
            }
        });

        this.wss.on('connection', (ws: WebSocket) => {
            ws.on('message', (message: any) => {
                try {
                    const msgStr = message.toString();
                    const data = JSON.parse(msgStr);
                    if (data.type === 'log') {
                         const level = data.level || 'info';
                         const text = data.message || '';
                         const logMessage = `[Browser ${level.toUpperCase()}] ${text}`;
                         switch (level) {
                            case 'error': console.error(logMessage); break;
                            case 'warn': console.warn(logMessage); break;
                            case 'info': console.info(logMessage); break;
                            case 'debug': console.debug(logMessage); break;
                            default: console.log(logMessage); break;
                         }
                    }
                } catch (err) {
                    // ignore
                }
            });
        });
    }
    
    public injectMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const originalSend = res.send;
        const originalSendFile = res.sendFile;

        // @ts-ignore
        res.send = function(body: any) {
            if (typeof body === 'string' && (body.includes('</head>') || body.includes('<body'))) {
                let modified = body;
                if (body.includes('</head>')) {
                    modified = body.replace('</head>', INJECTION_SCRIPT + '</head>');
                } else if (body.includes('<body')) {
                    modified = body.replace('<body', INJECTION_SCRIPT + '<body');
                } else {
                    modified = INJECTION_SCRIPT + body;
                }
                this.set('X-Console-Injected', 'true');
                return originalSend.call(this, modified);
            }
            return originalSend.call(this, body);
        };

        // @ts-ignore
        res.sendFile = function(file: string, options?: any, callback?: (err?: any) => void) {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            
            if (file.endsWith('.html') || file.endsWith('.htm')) {
                let htmlPath = file;
                if (options?.root) {
                    htmlPath = path.resolve(options.root, file);
                    const relativePath = path.relative(options.root, htmlPath);
                    const segments = relativePath.split(path.sep);
                    if (path.isAbsolute(relativePath) || segments[0] === '..'
                        || (options.dotfiles !== 'allow' && segments.some(segment => segment.startsWith('.')))) {
                        return originalSendFile.call(this, file, options, callback);
                    }
                }

                fs.readFile(htmlPath, 'utf8', (err, data) => {
                    if (err) {
                        if (callback) callback(err);
                        else originalSendFile.call(this, file, options);
                        return;
                    }
                    
                    let modified = data;
                    let injected = false;
                    
                    if (data.includes('</head>')) {
                        modified = data.replace('</head>', INJECTION_SCRIPT + '</head>');
                        injected = true;
                    } else if (data.includes('<body')) {
                        modified = data.replace('<body', INJECTION_SCRIPT + '<body');
                        injected = true;
                    } else {
                        modified = INJECTION_SCRIPT + data;
                        injected = true;
                    }
                    
                    if (injected) {
                        this.set('X-Console-Injected', 'true');
                        this.send(modified);
                    } else {
                        originalSendFile.call(this, file, options, callback);
                    }
                });
            } else {
                originalSendFile.call(this, file, options, callback);
            }
        };

        // Intercept HTML requests that might be handled by static middleware
        // Because static middleware uses pipe which bypasses res.sendFile override
        // We manually find the file and use res.sendFile to trigger the override
        if (req.method === 'GET' && (req.path.endsWith('.html') || req.path.endsWith('.htm') || req.path.endsWith('/'))) {
             for (const config of middlewareService.middlewareStaticFile) {
                 // Check if req.path matches config.url (mount point)
                 // e.g. config.url = '/build', req.path = '/build/web-mobile/index.html'
                 
                 const urlPrefix = config.url.endsWith('/') ? config.url : config.url + '/';
                 // Handle exact match or prefix match
                 if (req.path === config.url || req.path.startsWith(urlPrefix)) {
                     
                     let relativePath = req.path.slice(config.url.length);
                     if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
                     
                     // If empty or ends with slash, look for index.html
                     if (!relativePath || relativePath.endsWith('/')) {
                         relativePath += 'index.html';
                     }
                     
                     const fsPath = path.join(config.path, relativePath);
                     
                     // Check if file exists and is html
                     try {
                         if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile() && (fsPath.endsWith('.html') || fsPath.endsWith('.htm'))) {
                             // Send it using sendFile which is overridden
                             res.sendFile(fsPath);
                             return;
                         }
                     } catch (e) {
                         // ignore error
                     }
                 }
             }
        }

        next();
    }
}

export const consoleLogService = new ConsoleLogService();
