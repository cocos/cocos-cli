import { join } from 'path';
import GamePreviewMiddleware from '../game-preview.middleware';
import { getPreviewToolbarOptions, resetPreviewToolbarOptions } from '../preview-toolbar-options';
import i18n from '../../base/i18n';

/**
 * 回归测试：浏览器预览入口 `/` 必须能在「builder / scene 尚未初始化」时就渲染 game.ejs。
 *
 * 背景 bug：registerBrowserPreview（注册 `/` 路由）原先在 launcher 里排在耗时的 initBuilder /
 * initScene 之后。CLI 初始化期（约 1 分钟）server 已 listen、但 `/` 尚未注册，浏览器打开预览
 * 命中 server.ts 的兜底 404（"404 - Not Found"）——拿到一张没有 socket.io、没有 browser:reload
 * 监听的裸 404 页，之后 CLI 就绪也无从通知它刷新，永远停在 404。
 *
 * 修复：把 registerBrowserPreview 前置到 startServer 之后、builder/scene 初始化之前。其正确性依赖
 * 一个不变量——`/` 处理器只需 scripting.projectPath 即可渲染 game.ejs，**不依赖 builder**。本测试
 * 锁定该不变量：不初始化任何 builder，仅提供 scripting.projectPath，`/` 即返回带 socket.io 客户端与
 * browser:reload 自愈能力的 game.ejs（HTTP 200）。若未来有人让 `/` 依赖 builder，本测试会失败，
 * 提醒早注册将退回裸 404 的老 bug。
 */
// 用 path.join 构造平台原生路径（handler 内部对 projectPath 走 basename，Windows 盘符路径在此不适用）。
const scripting = { projectPath: join('any', 'fake', 'project') } as { projectPath: string };
jest.mock('../../scripting', () => ({ __esModule: true, default: scripting }));

interface MockRes {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    status(code: number): MockRes;
    set(k: string, v: string): MockRes;
    send(payload: string): MockRes;
}

function makeRes(): MockRes {
    const res: MockRes = {
        statusCode: 0,
        body: '',
        headers: {},
        status(code: number) { this.statusCode = code; return this; },
        set(k: string, v: string) { this.headers[k] = v; return this; },
        send(payload: string) { this.body = payload; return this; },
    };
    return res;
}

function findRootHandler() {
    const entry = (GamePreviewMiddleware.get || []).find((m: any) => m.url === '/');
    if (!entry) {
        throw new Error('GamePreview middleware has no `/` route');
    }
    return entry.handler as (req: any, res: any, next: any) => Promise<void> | void;
}

describe('game preview `/` route works before builder init (early-registration invariant)', () => {
    beforeEach(async () => {
        resetPreviewToolbarOptions();
        await i18n.setLanguage('en');
    });

    it('renders game.ejs (200) with only scripting.projectPath, no builder', async () => {
        const handler = findRootHandler();
        const req = {
            protocol: 'http',
            get: (h: string) => (h === 'host' ? 'localhost:9527' : ''),
            query: { scene: '42e68f34-5f5f-4a8a-938a-ec9d5fe61b0d' },
        };
        const res = makeRes();
        const next = jest.fn();

        await handler(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        // 拿到的是真正的预览页（含 GameCanvas），不是裸 404
        expect(res.body).toContain('GameCanvas');
        // 关键自愈前提：页面在 settings.js 之前就装好 socket.io 客户端，并引入共用的热重载「接收端」
        // （preview-live-reload.js 负责创建 socket + 注册 browser:reload 监听），CLI 就绪后即可被广播刷新。
        expect(res.body).toContain('/socket.io/socket.io.js');
        expect(res.body).toContain('/static/web/preview-live-reload.js');
        // 工具栏是浏览器预览页面的可选层；普通 URL 仍保持纯游戏画面，由查询参数显式启用。
        expect(res.body).toContain('/static/web/game-preview.css');
        expect(res.body).toContain('/static/web/game-preview-ui.js');
        expect(res.body).toContain("get('previewToolbar') === '1'");
        // settings.js 带上 scene 查询，指向惰性计算的预览 settings 路由
        expect(res.body).toContain('/preview/settings.js?scene=');
    });

    it('exposes `/` ahead of the scene middleware broad routes (ordering sanity)', () => {
        // GamePreview 必须显式提供 `/`，registerBrowserPreview 早注册时它才能先于场景宽泛路由命中。
        const urls = (GamePreviewMiddleware.get || []).map((m: any) => String(m.url));
        expect(urls).toContain('/');
    });

    it('keeps Creator-style toolbar options across a refreshed page', async () => {
        const handlers = new Map<string, Function>();
        (GamePreviewMiddleware.socket as any).connection({
            on: (event: string, handler: Function) => handlers.set(event, handler),
        });

        handlers.get('changeOption')?.('debugMode', 'INFO_FOR_WEB_PAGE');
        handlers.get('changeOption')?.('showFps', true);
        handlers.get('changeOption')?.('device', 'iphone-14');
        handlers.get('changeOption')?.('rotate', true);

        expect(getPreviewToolbarOptions()).toEqual({
            debugMode: 'INFO_FOR_WEB_PAGE',
            showFps: true,
            device: 'iphone-14',
            rotate: true,
        });

        const handler = findRootHandler();
        const req = { protocol: 'http', get: () => 'localhost:9527', query: {} };
        const res = makeRes();
        await handler(req, res, jest.fn());

        expect(res.body).toContain('"debugMode":"INFO_FOR_WEB_PAGE"');
        expect(res.body).toContain('"showFps":true');
        expect(res.body).toContain('"device":"iphone-14"');
        expect(res.body).toContain('"rotate":true');
    });

    it('injects Creator-style localized device names from the CLI i18n service', async () => {
        await i18n.setLanguage('zh');
        const handler = findRootHandler();
        const req = { protocol: 'http', get: () => 'localhost:9527', query: {} };
        const res = makeRes();

        await handler(req, res, jest.fn());

        expect(res.body).toContain('"designResolution":"设计分辨率"');
        expect(res.body).toContain('"fullScreen":"全屏"');
        expect(res.body).toContain('"webpageFullScreen":"网页全屏"');
    });
});
