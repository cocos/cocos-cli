import utils from '../core/base/utils';
import { GlobalPaths } from '../global';
import scripting from '../core/scripting';
import { startServer } from '../server';

export class CocosLib {
    private static started = false;
    private static async init(projectPath: string): Promise<void> {
        /**
         * 初始化一些基础模块信息
         */
        utils.Path.register('project', {
            label: '项目',
            path: projectPath,
        });
        const { configurationManager } = await import('../core/configuration');
        await configurationManager.initialize(projectPath);
        // 初始化项目信息
        const { default: Project } = await import('../core/project');
        await Project.open(projectPath);
        // 初始化引擎
        const { initEngine } = await import('../core/engine');
        await initEngine(GlobalPaths.enginePath, projectPath);
        console.log('initEngine success');
    }

    /**
     * 导入资源
     */
    private static async import(projectPath: string): Promise<void> {
        await this.init(projectPath);
        // 在导入资源之前，初始化 scripting 模块，才能正常导入编译脚本
        const { Engine } = await import('../core/engine');
        await scripting.initialize(projectPath, GlobalPaths.enginePath, Engine.getConfig().includeModules);
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('../core/assets');
        await startupAssetDB();
    }

    /**
     * 启动项目
     */
    static async startup(projectPath: string, port?: number): Promise<void> {
        if (this.started) {
            return;
        }
        this.started = true;
        await this.import(projectPath);
        await startServer(port);
        // // 初始化构建
        // const { init: initBuilder } = await import('../core/builder');
        // await initBuilder();
        // // 启动场景进程，需要在 Builder 之后，因为服务器路由场景还没有做前缀约束匹配范围比较广
        // await startupScene(GlobalPaths.enginePath, projectPath);
    }
}
