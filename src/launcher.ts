
import Project from './core/project';
import Engine from './core/engine';
import { startupAssetDB } from './core/assets';

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
        await Project.open(path);
        // TODO 初始化引擎环境
        await Engine.init(enginePath);

        // 启动以及初始化资源数据库
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
    const { engine } = require('../.user.json');
    const { join } = require('path');
    const ccEngine = await Engine.init(engine);
    await ccEngine.initEngine({
        importBase: join(engine, 'library'),
        nativeBase: join(engine, 'library'),
    });
})();
