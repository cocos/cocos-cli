import i18n from '../base/i18n';
import { sceneConfigInstance } from './scene-configs';
// 接口类型
export * from './common';
// 主进程
export * from './main-process';
export { sceneConfigInstance };

import { middlewareService } from '../../server/middleware';
import SceneMiddleware from './scene.middleware';
import SceneScriptingMiddleware from './scene.scripting.middleware';

const i18nModules: Record<string, () => Promise<any>> = {
    zh: () => import('./i18n/zh'),
    en: () => import('./i18n/en'),
};

export async function loadSceneI18n() {
    for (const [lang, loader] of Object.entries(i18nModules)) {
        try {
            const data = await loader();
            i18n.registerLanguagePatch(lang, 'scene', data.default || data);
        } catch (error) {
            console.warn(`[Scene] Failed to load scene i18n for ${lang}:`, error);
        }
    }
}

// 场景配置初始化
export async function init() {
    await loadSceneI18n();
    middlewareService.register('SceneScripting', SceneScriptingMiddleware);
    middlewareService.register('Scene', SceneMiddleware);
    await sceneConfigInstance.init();
}

/**
 * 启动场景
 * @param enginePath 引擎目录
 * @param projectPath 项目目录
 */
export async function startupScene(enginePath: string, projectPath: string) {
    await init();
    // 启动场景进程
    const { sceneWorker } = await import('./main-process/scene-worker');
    await sceneWorker.start(enginePath, projectPath);
}
