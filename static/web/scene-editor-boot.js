/* global System, globalThis */

import { loadEngine } from '/static/web/engine-loader.js';

/**
 * 场景编辑器预览引导。
 *
 * 引擎加载流程与浏览器游戏预览的 game-boot.js 共用 engine-loader.js；区别在于这里以默认
 * 编辑器模式加载（不覆盖 CC_EDITOR/CC_PREVIEW），并在结尾加载 scene-bundle 启动场景服务，
 * 而不是运行游戏。
 *
 * @param {{ gameView?: boolean }} [options]
 *   gameView=true：「Preview in Editor」游戏视图模式（对齐 cocos-editor 的 preview 进程）。
 *   在加载引擎前置 window.isPreviewProcess=true，使引擎 internal:constants 解析出
 *   EDITOR_NOT_IN_PREVIEW=false（director.tick 派发输入帧、mainLoop 按游戏时钟算 dt）；
 *   cc.GAME_VIEW 由 scene-bundle 的 startup({gameView}) 在引擎模块求值后显式置位——组件
 *   生命周期（node-activator / component-scheduler）均为运行时读取，游戏即可在编辑器引擎里
 *   真正跑起来，且无需修改上游引擎源码。startup 同时以 gameView 模式套用预览设计分辨率策略，
 *   且不自动恢复编辑器 tick（由 PreviewPlay 服务在播放/暂停切换时接管 Engine.pause/resume）。
 */
export default async function boot(options = {}) {
    try {
        const gameView = !!options.gameView;
        if (gameView) {
            // 必须在 loadEngine（引擎模块执行）之前设置：internal:constants 在引擎求值时读取该全局。
            window.isPreviewProcess = true;
        }
        const env = await loadEngine();

        const _originalSystem = System;
        console.log('[Scene] loading scene bundle');
        // SystemJS natively awaits the attached import maps above
        const SceneBundle = await System.import('/static/web/scene-bundle.js');
        const { startup, Service } = SceneBundle;

        globalThis.System = _originalSystem;
        await startup({
            enginePath: env.enginePath,
            serverURL: env.serverURL,
            gameView,
        });

        if (!gameView) {
            Service?.Engine?.resume?.();
        }
        console.log('Cocos Engine and Scene Services loaded successfully');
    } catch (err) {
        console.error('Failed to load Cocos Engine or Services:', err.stack || err);
    }
}
