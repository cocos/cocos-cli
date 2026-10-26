import type { IncomingMessage, Server as HttpServer } from 'http';
import { isAllowedHostHeader } from '../../../../server/utils/request-guard';

// LightFX embeds a Socket.IO 2.x client. Keep the legacy server in the Node host so the browser
// Scene runtime never has to load either Socket.IO or Node's networking/process modules.
const createLegacySocketServer = require('socket.io-v2') as (server: HttpServer, options: object) => any;

/**
 * 烘焙期间的服务只给原生 LightFX 进程用，它直连 `http://127.0.0.1:<port>`，不带 Origin。
 * 浏览器发起的连接总会带 Origin，因此一律拒绝；Host 校验用于挡住 DNS 重绑定。
 */
export function lightFXRejectReason(req: IncomingMessage): string | undefined {
    if (!isAllowedHostHeader(req.headers.host)) {
        return 'Host not allowed';
    }
    if (req.headers.origin !== undefined) {
        return 'Origin not allowed';
    }
    return undefined;
}

export function createLightFXSocketServer(http: HttpServer): any {
    return createLegacySocketServer(http, {
        serveClient: false,
        transports: ['websocket', 'polling'],
        allowRequest: (req: IncomingMessage, callback: (err: string | null, success: boolean) => void) => {
            const reason = lightFXRejectReason(req);
            callback(reason ?? null, !reason);
        },
    });
}
