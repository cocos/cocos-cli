import { join } from 'path';
import { IBuildCommandOption } from './core/builder/@types/protected';
import utils from './core/base/utils';
import { newConsole } from './core/base/console';
import { getCurrentLocalTime } from './core/assets/utils';
import { PackerDriver } from './core/scripting/packer-driver';

class ProjectManager {

    create() {

    }

    /**
     * 打开某个项目
     * @param path
     * @param enginePath
     */
    async open(path: string, enginePath: string) {
        /**
         * 初始化一些基础模块信息
         */
        utils.Path.register('project', {
            label: '项目',
            path,
        });
        const { configurationManager } = await import('./core/configuration');
        await configurationManager.initialize(path);
        // 初始化项目信息
        const { default: Project } = await import('./core/project');
        await Project.open(path);
        // 初始化引擎
        const { default: Engine } = await import('./core/engine');
        await Engine.init(enginePath);
        console.log('initEngine', enginePath);
        await Engine.initEngine({
            importBase: join(path, 'library'),
            nativeBase: join(path, 'library'),
            writablePath: join(path, 'temp'),
        });
        console.log('initEngine success');
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('./core/assets');
        console.log('startupAssetDB', path);
        await startupAssetDB();
        const packDriver = await PackerDriver.create(path, enginePath);
        await packDriver.init(Engine.getConfig().includeModules);
        await packDriver.resetDatabases();
        await packDriver.build();
    }

    /**
     * 构建某个项目
     * @param projectPath
     * @param enginePath
     * @param options
     */
    async build(projectPath: string, enginePath: string, options: Partial<IBuildCommandOption>) {
        if (!options.logDest) {
            options.logDest = join(projectPath, 'temp/build', getCurrentLocalTime() + '.log');
        }
        await newConsole.init(options.logDest);
        await newConsole.record();
        await newConsole.startProgress('Start build project...');

        // 先打开项目
        await this.open(projectPath, enginePath);
        // 执行构建流程
        const { build } = await import('./core/builder');
        return await build(options);
    }
}

export const projectManager = new ProjectManager();
