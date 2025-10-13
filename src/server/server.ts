import express, { Express, Router } from 'express';
import compression from 'compression';
import { existsSync, readFile } from 'fs-extra';
import { createServer as createHTTPServer, Server as HTTPServer } from 'http';
import { createServer as createHTTPSServer, Server as HTTPSServer } from 'https';
import { getAvailablePort } from './utils';

import { socketService } from './socket';
import { middlewareService } from './middleware';
import { cors } from './utils/cors';

export class ServerService {
    private app: Express = express();
    private httpServer: HTTPServer | undefined;
    private httpsServer: HTTPSServer | undefined;
    private httpPost = 7456;
    private httpsPost = 7456;

    configs = {
        port: 7456,
        https: {
            port: 7456,
            enable: false,
            key: '',
            cert: '',
            ca: '',
        }
    }

    public get url() {
        return this.httpsUrl || this.httpUrl || 'http://localhost:9999999';
    }

    private get httpsUrl() {
        if (this.httpsServer && this.httpsServer.listening) return `https://localhost:${this.httpsPost}`;
        return undefined;
    }

    private get httpUrl() {
        if (this.httpServer && this.httpServer.listening) return `https://localhost:${this.httpPost}`;
        return undefined;
    }

    async start() {
        console.log('🚀 开始启动服务器...');
        this.init();
        await this.createHttpServer();
        await this.createHttpsServer();
        socketService.startup(this.httpsServer || this.httpServer!);

        // 打印服务器地址
        this.printServerUrls();
    }

    async stop() {
        [this.httpServer, this.httpsServer].forEach(server => {
            server?.close();
        });
        this.httpServer = undefined;
        this.httpsServer = undefined;
    }

    private printServerUrls() {
        const hasHttpListening = !!(this.httpServer && this.httpServer.listening);
        const hasHttpsListening = !!(this.httpsServer && this.httpsServer.listening);
        if (!hasHttpListening && !hasHttpsListening) {
            console.warn('⚠️ 服务器未开启或未监听端口');
            return;
        }
        console.log('\n🚀 服务器已启动:');
        if (hasHttpListening) {
            console.log(`   HTTP: ${this.httpUrl}`);
        }
        if (hasHttpsListening) {
            console.log(`   HTTPS: ${this.httpsUrl}`);
        }
    }

    async createHttpServer() {
        this.httpPost = await getAvailablePort(this.configs.port);
        this.httpServer = createHTTPServer(this.app);
        this.httpServer.listen(this.httpPost);
    }

    async createHttpsServer() {
        const httpsConfig = this.configs.https;
        if (!httpsConfig.enable) {
            return;
        }
        this.httpsPost = await getAvailablePort(this.configs.https.port);
        const options: { key?: Buffer, cert?: Buffer, ca?: Buffer, } = {
            key: undefined,
            cert: undefined,
            ca: undefined,
        };
        if (existsSync(httpsConfig.key)) {
            options.key = await readFile(httpsConfig.key);
        }
        if (existsSync(httpsConfig.cert)) {
            options.cert = await readFile(httpsConfig.cert);
        }
        if (existsSync(httpsConfig.ca)) {
            options.ca = await readFile(httpsConfig.ca);
        }
        this.httpsServer = createHTTPSServer(options, this.app);
        this.httpsServer.listen(this.httpsPost);
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
