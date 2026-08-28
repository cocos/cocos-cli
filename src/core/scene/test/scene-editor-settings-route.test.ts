const mockGetCachedSceneEditorSettings = jest.fn();

jest.mock('../../preview/preview-settings', () => ({
    getCachedSceneEditorSettings: (...args: any[]) => mockGetCachedSceneEditorSettings(...args),
    PreviewNotReadyError: class PreviewNotReadyError extends Error {},
}));

import SceneScriptingMiddleware from '../scene.scripting.middleware';

function findSettingsHandler() {
    const route = (SceneScriptingMiddleware.get || []).find((item: any) => item.url === '/scene-editor/settings.json');
    if (!route) {
        throw new Error('Missing scene editor settings route');
    }
    return route.handler as (req: any, res: any, next: any) => Promise<void>;
}

function findRouteHandler(pattern: RegExp) {
    const route = (SceneScriptingMiddleware.get || []).find((item: any) => String(item.url) === String(pattern));
    if (!route) {
        throw new Error(`Missing route: ${pattern}`);
    }
    return route.handler as (req: any, res: any, next: any) => Promise<void>;
}

describe('scene editor settings route', () => {
    beforeEach(() => {
        mockGetCachedSceneEditorSettings.mockReset().mockResolvedValue({
            settings: { assets: {} },
            bundleConfigs: [{ name: 'main', deps: [], paths: { 'fbx-uuid@material': ['flower/material', 'cc.Material', 1] } }],
        });
    });

    it('serves scene editor settings from the scene editor asset environment', async () => {
        const handler = findSettingsHandler();
        const res = {
            set: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const next = jest.fn();

        await handler({ query: {} }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(mockGetCachedSceneEditorSettings).toHaveBeenCalledWith();
        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            settings: { assets: {} },
            bundleConfigs: [{ name: 'main', deps: [], paths: { 'fbx-uuid@material': ['flower/material', 'cc.Material', 1] } }],
        });
    });

    it('serves scene editor bundle config from the latest scene editor settings', async () => {
        const settingsHandler = findSettingsHandler();
        const configHandler = findRouteHandler(/^\/scene-editor\/assets\/([^/]+)\/(?:config|cc\.config)\.json$/);
        const settingsRes = {
            set: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const configRes = {
            set: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const next = jest.fn();

        await settingsHandler({ query: {} }, settingsRes, next);
        await configHandler(
            { path: '/scene-editor/assets/main/config.json' },
            configRes,
            next,
        );

        expect(next).not.toHaveBeenCalled();
        expect(configRes.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(configRes.status).toHaveBeenCalledWith(200);
        expect(configRes.json).toHaveBeenCalledWith({
            name: 'main',
            deps: [],
            paths: { 'fbx-uuid@material': ['flower/material', 'cc.Material', 1] },
        });
    });
});
