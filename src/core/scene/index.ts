import { sceneConfigInstance } from './scene-configs';
// 接口类型
export * from './common';
// 主进程
export * from './main-process';
export { sceneConfigInstance };

/**
 * 启动场景
 * @param enginePath 引擎目录
 * @param projectPath 项目目录
 */
export async function startupScene(enginePath: string, projectPath: string) {
    // 场景配置初始化
    await sceneConfigInstance.init();
    // 启动场景进程
    const { sceneWorker } = await import('./main-process/scene-worker');
    await sceneWorker.start(enginePath, projectPath);
}
