import express, { Express } from 'express';
import compression from 'compression';
import { existsSync, readFileSync } from 'fs-extra';
import { createServer as createHTTPServer, Server as HTTPServer } from 'http';
import { createServer as createHTTPSServer, Server as HTTPSServer } from 'https';
import { getAvailablePort } from './utils';

import { socketService } from './socket';
import { middlewareService } from './middleware';
import { cors } from './utils/cors';
import path from 'path';

interface ServerOptions {
    port: number,// 端口
    useHttps: boolean;// 是否启动 HTTPS
    keyFile?: string; // HTTPS 私钥文件路径
    certFile?: string;// HTTPS 证书文件路径
    caFile?: string;// 证书的签发请求文件 csr
}

export class ServerService {
    private app: Express = express();
    private server: HTTPServer | HTTPSServer | undefined;
    private port = 7456;
    private useHttps = false;
    private httpsConfig = {
        key: '',// HTTPS 私钥文件路径
        cert: '',// HTTPS 证书文件路径
        ca: '',// 证书的签发请求文件 csr ，没有可省略
    }

    public get url() {
        if (this.server && this.server.listening) {
            const httpRoot = this.useHttps ? 'https' : 'http';
            return `${httpRoot}://localhost:${this.port}`;
        }
        return 'http://localhost:9999999';
    }

    async start() {
        console.log('🚀 开始启动服务器...');
        this.init();
        this.port = await getAvailablePort(this.port);
        this.server = await this.createServer({
            port: this.port,
            useHttps: this.useHttps,
            keyFile: this.httpsConfig.key,
            certFile: this.httpsConfig.cert,
            caFile: this.httpsConfig.ca,
        }, this.app);
        socketService.startup(this.server);
        // 打印服务器地址
        this.printServerUrls();
    }

    async stop() {
        this.server?.close();
        this.server = undefined;
    }

    /**
     * 创建 HTTP 或 HTTPS 服务器并等待启动
     * @param options 配置对象
     * @param requestHandler
     * @returns Promise<http.Server | https.Server>
     */
    async createServer(options: ServerOptions, requestHandler: Express): Promise<HTTPServer | HTTPSServer> {
        const { port, useHttps, keyFile, certFile, caFile } = options;

        let server: HTTPServer | HTTPSServer;

        if (useHttps) {
            if (!keyFile || !certFile) {
                return Promise.reject(new Error('HTTPS requires keyFile and certFile'));
            }
            const options: { key?: Buffer, cert?: Buffer, ca?: Buffer, } = {
                key: undefined,
                cert: undefined,
                ca: undefined,
            }
            if (existsSync(keyFile)) {
                options.key = readFileSync(path.resolve(keyFile));
            }
            if (existsSync(certFile)) {
                options.cert = readFileSync(certFile);
            }
            if (caFile && existsSync(caFile)) {
                options.ca = readFileSync(caFile);
            }
            server = createHTTPSServer(options, requestHandler);
        } else {
            server = createHTTPServer(requestHandler);
        }

        return new Promise((resolve, reject) => {
            server.once('listening', () => {
                resolve(server);
            });

            server.once('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`❌ 端口 ${port} 已被占用`);
                } else {
                    console.error(`❌ ${useHttps ? 'HTTPS' : 'HTTP'} 服务器启动失败:`, err);
                }
                reject(err);
            });

            server.listen(port);
        });
    }

    private printServerUrls() {
        const hasListening = !!(this.server && this.server.listening);
        if (!hasListening) {
            console.warn('⚠️ 服务器未开启或未监听端口');
            return;
        }
        console.log(`\n🚀 服务器已启动: ${this.url}`);
    }

    init () {
        this.app.use(compression());
        this.app.use(cors);
        this.app.use(middlewareService.router);

        // 未能正常响应的接口
        this.app.use((req: any, res: any) => {
            res.status(404);
            res.send('404 - Not Found');
        });

        // 出现错误的接口
        this.app.use((err: any, req: any, res: any, next: any) => {
            console.error(err);
            res.status(500);
            res.send('500 - Server Error');
        });
    }
}

export const serverService = new ServerService();
