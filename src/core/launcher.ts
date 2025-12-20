import { join } from 'path';
import { IBuildCommandOption, Platform } from './builder/@types/protected';
import utils from './base/utils';
import { newConsole } from './base/console';
import { getCurrentLocalTime } from './assets/utils';
import { startServer } from '../server';
import { GlobalConfig, GlobalPaths } from '../global';
import scripting from './scripting';
import { startupScene } from './scene';


/**
 * 启动器，主要用于整合各个模块的初始化和关闭流程
 * 默认支持几种启动方式：单独导入项目、单独启动项目、单独构建项目
 */
export default class Launcher {
    private projectPath: string;

    private _init = false;
    private _import = false;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
        // 初始化日志系统
        newConsole.init(join(this.projectPath, 'temp', 'logs'), true);
        newConsole.record();
    }

    private async init() {
        if (this._init) {
            return;
        }
        this._init = true;
        /**
         * 初始化一些基础模块信息
         */
        utils.Path.register('project', {
            label: '项目',
            path: this.projectPath,
        });
        const { configurationManager } = await import('./configuration');
        await configurationManager.initialize(this.projectPath);
        // 初始化项目信息
        const { default: Project } = await import('./project');
        await Project.open(this.projectPath);
        // 初始化引擎
        const { initEngine } = await import('./engine');
        await initEngine(GlobalPaths.enginePath, this.projectPath);
        console.log('initEngine success');
    }

    /**
     * 导入资源
     */
    async import() {
        if (this._import) {
            return;
        }
        this._import = true;
        await this.init();
        // 在导入资源之前，初始化 scripting 模块，才能正常导入编译脚本
        const { Engine } = await import('./engine');
        await scripting.initialize(this.projectPath, GlobalPaths.enginePath, Engine.getConfig().includeModules);
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('./assets');
        await startupAssetDB();
    }

    /**
     * 启动项目
     */
    async startup(port?: number) {
        await this.import();
        await startServer(port);
        // 初始化构建
        const { init: initBuilder, startup } = await import('./builder');
        await initBuilder();
        // 启动场景进程，需要在 Builder 之后，因为服务器路由场景还没有做前缀约束匹配范围比较广
        await startupScene(GlobalPaths.enginePath, this.projectPath);
        await startup();
    }

    /**
     * 构建，主要是作为命令行构建的入口
     * @param platform
     * @param options
     */
    async build(platform: Platform, options: Partial<IBuildCommandOption>) {
        GlobalConfig.mode = 'simple';
        await this.import();
        if (!options.logDest) {
            options.logDest = join(this.projectPath, 'temp/build', getCurrentLocalTime() + '.log');
        }
        // 先导入项目
        await this.import();
        // 执行构建流程
        const { init, build } = await import('./builder');
        await init(platform);
        return await build(platform, options);
    }

    static async make(platform: Platform, dest: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        await init(platform);
        return await executeBuildStageTask('command make', 'make', {
            platform,
            dest,
        });
    }

    static async run(platform: Platform, dest: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        if (platform.startsWith('web')) {
            await startServer();
        }
        await init(platform);
        return await executeBuildStageTask('command run', 'run', {
            platform,
            dest,
        });
    }

    async close() {
        // 保存项目配置
        const { default: Project } = await import('./project');
        await Project.close();
        // ----- TODO 可能有的更多其他模块的保存销毁操作 ----
    }
}