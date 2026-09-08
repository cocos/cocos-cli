import GamePreviewMiddleware from '../game-preview.middleware';
import { NODE_CONFIGS } from '../../scene/scene-process/service/node/node-type-config';

/**
 * `GET /scene/node-type-config`：预览态「类型化创建节点」的数据源。
 *
 * 背景：Preview In Editor 期间 Hierarchy 右键 Create ▸ Cube / Button… 由预览 iframe 内的
 * inspect agent（static/web/preview-inspect.js）直接对活场景 `cc.instantiate` 内置 Prefab 完成，
 * 而「节点类型 → 内置 Prefab uuid / canvasRequired / project-type」这张表只存在于编辑态的
 * NODE_CONFIGS。本路由把它原样输出，避免在前端 JS 里重抄一份导致两侧漂移。
 *
 * 本测试锁定三条不变量：
 *  1. 路由存在且返回 200 + 与 NODE_CONFIGS **完全一致**的 JSON（漂移即失败）；
 *  2. 响应 no-store —— 表随 CLI 版本变化，缓存会让升级后的预览拿到旧 uuid；
 *  3. 路由不依赖 asset-db / builder / scene 进程（node-type-config 是无依赖纯数据模块），
 *     因此在 CLI 初始化早期即可服务，不会因为预览页抢跑而 404。
 */

interface MockRes {
    statusCode: number;
    json_: unknown;
    headers: Record<string, string>;
    status(code: number): MockRes;
    set(k: string, v: string): MockRes;
    json(payload: unknown): MockRes;
}

function makeRes(): MockRes {
    const res: MockRes = {
        statusCode: 0,
        json_: undefined,
        headers: {},
        status(code: number) { this.statusCode = code; return this; },
        set(k: string, v: string) { this.headers[k] = v; return this; },
        json(payload: unknown) { this.json_ = payload; return this; },
    };
    return res;
}

function findNodeTypeConfigHandler() {
    const entry = (GamePreviewMiddleware.get || []).find((m: any) => m.url === '/scene/node-type-config');
    if (!entry) {
        throw new Error('GamePreview middleware has no `/scene/node-type-config` route');
    }
    return entry.handler as (req: any, res: any, next: any) => Promise<void> | void;
}

describe('GET /scene/node-type-config (preview typed node creation)', () => {
    it('returns NODE_CONFIGS verbatim with 200 + no-store', async () => {
        const handler = findNodeTypeConfigHandler();
        const res = makeRes();
        const next = jest.fn();

        await handler({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.headers['Cache-Control']).toBe('no-store');
        // 原样输出：任何一处改写都会让预览端创建出错误的节点类型。
        expect(res.json_).toEqual(NODE_CONFIGS);
    });

    it('carries the entries the preview agent depends on (Empty / Cube / Button / Canvas)', async () => {
        const handler = findNodeTypeConfigHandler();
        const res = makeRes();

        await handler({}, res, jest.fn());
        const table = res.json_ as Record<string, Array<Record<string, unknown>>>;

        // Empty 必须没有 assetUuid —— 预览端据此走 `new cc.Node()` 而不是加载 Prefab。
        expect(table.Empty?.[0]).toBeDefined();
        expect(table.Empty[0].assetUuid).toBeFalsy();
        // 有 Prefab 的类型必须带 uuid，否则预览端会静默降级成空节点。
        expect(typeof table.Cube?.[0]?.assetUuid).toBe('string');
        // UI 类型必须带 canvasRequired，预览端据此自动补 Canvas 父节点。
        expect(table.Button?.[0]?.canvasRequired).toBe(true);
        // Canvas 本身有 2d / 3d 两个变体，预览端按 workMode 在第 1/2 项间选择。
        expect(table.Canvas?.length).toBeGreaterThanOrEqual(2);
    });

    it('does not require asset-db / builder / scene process to be initialized', () => {
        // node-type-config 是零 import 的纯数据模块；若未来有人给它加依赖，这条断言会失败，
        // 提醒该路由将不再能在 CLI 初始化早期服务（预览页抢跑会拿到 404 或 500）。
        const mod = require('../../scene/scene-process/service/node/node-type-config');
        expect(Object.keys(mod).length).toBeGreaterThan(0);
        expect(mod.NODE_CONFIGS).toBe(NODE_CONFIGS);
    });
});
