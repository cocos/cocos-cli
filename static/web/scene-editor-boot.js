/* global System, globalThis */

import { loadEngine, composeServerURL } from '/static/web/engine-loader.js';

/**
 * 场景编辑器 / 资源预览引导。
 *
 * 引擎加载流程与浏览器游戏预览的 game-boot.js 共用 engine-loader.js；区别在于这里以默认
 * 编辑器模式加载（不覆盖 CC_EDITOR/CC_PREVIEW），并在结尾加载 scene-bundle 启动场景服务，
 * 而不是运行游戏。
 *
 * 服务地址通过入参传入（ip/port），不再依赖 window.WebEnv 全局。
 *
 * @param {{ ip?: string, port?: number|string, https?: boolean }} [addr]
 * @returns {Promise<{ services: object, events: object, serverURL: string } | null>}
 *   场景服务上下文：`services` 为服务集（Engine/Editor/Camera/...），`events` 为服务事件总线。
 */
export default async function boot(addr = {}) {
    try {
        const serverURL = composeServerURL(addr);
        const env = await loadEngine(serverURL);

        const _originalSystem = System;
        console.log('[Scene] loading scene bundle');
        // SystemJS natively awaits the attached import maps above
        const SceneBundle = await System.import('/static/web/scene-bundle.js');
        const { startup, serviceManager } = SceneBundle;

        globalThis.System = _originalSystem;
        await startup({
            enginePath: env.enginePath,
            serverURL,
        });


        const services = serviceManager.getServices();
        const events = serviceManager.getServiceEvents();
        services?.Engine?.resume?.();
        console.log('Cocos Engine and Scene Services loaded successfully');
        return { services, events, serverURL };
    } catch (err) {
        console.error('Failed to load Cocos Engine or Services:', err.stack || err);
        return null;
    }
}
