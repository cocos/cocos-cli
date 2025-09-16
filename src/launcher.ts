import { join } from 'path';

class ProjectManager {
    create() {

    }

    /**
     * 打开某个项目
     * @param path
     * @param enginePath
     */
    async open(path: string, enginePath: string) {
        // 初始化项目信息
        const { default: Project } = await import('./core/project');
        await Project.open(path);
        // 初始化引擎
        const { default: Engine } = await import('./core/engine');
        await Engine.init(enginePath);
        await Engine.initEngine({
            importBase: join(path, 'library'),
            nativeBase: join(path, 'library'),
        })
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('./core/assets');
        await startupAssetDB();
    }

    /**
     * 构建某个项目
     * @param projectPath 
     * @param options 
     */
    async build(projectPath: string, options: any) {

    }
}

export const projectManager = new ProjectManager();

// 这是测试代码，不能使用单元测试，因为 jest 会捕获 require 然后不走 preload 的特殊处理,导致读不了 cc
(async () => {
    const { engine, project } = require('../.user.json');
    await projectManager.open(project, engine)
})();
