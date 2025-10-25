import { join } from 'path';
import { IBuildCommandOption } from './builder/@types/protected';
import utils from './base/utils';
import { newConsole } from './base/console';
import { getCurrentLocalTime } from './assets/utils';
import { PackerDriver } from './scripting/packer-driver';
import { startServer } from '../server';
import { GlobalPaths } from '../global';
import assetManager from './assets/manager/asset';
import { AssetInfo, IAsset } from './assets/@types/protected/asset';
import { AssetChangeType } from './scripting/packer-driver/asset-db-interop';

class ProjectManager {

    create() {

    }

    /**
     * 打开某个项目
     * @param path
     */
    async open(path: string) {
        /**
         * 初始化一些基础模块信息
         */
        utils.Path.register('project', {
            label: '项目',
            path,
        });
        await startServer();
        const { configurationManager } = await import('./configuration');
        await configurationManager.initialize(path);
        // 初始化项目信息
        const { default: Project } = await import('./project');
        await Project.open(path);
        // 初始化引擎
        const { Engine, initEngine } = await import('./engine');
        await initEngine(GlobalPaths.enginePath, path);
        console.log('initEngine success');
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('./assets');
        console.log('startupAssetDB', path);
        await startupAssetDB();
        const packDriver = await PackerDriver.create(path, GlobalPaths.enginePath);
        await packDriver.init(Engine.getConfig().includeModules);
        await packDriver.resetDatabases();
        await packDriver.build();

        const onAssetChange = (type: AssetChangeType, asset: IAsset) => {
            const assetInfo = assetManager.queryAssetInfo(asset.uuid);
            packDriver.onAssetChange(AssetChangeType.modified, asset.uuid, assetInfo as Readonly<AssetInfo>, asset.meta);
        };

        assetManager.on('asset-change', (asset: IAsset) => onAssetChange(AssetChangeType.modified, asset));
        assetManager.on('asset-add', (asset: IAsset) => onAssetChange(AssetChangeType.add, asset));
        assetManager.on('asset-delete', (asset: IAsset) => onAssetChange(AssetChangeType.remove, asset));
    }

    /**
     * 构建某个项目
     * @param projectPath
     * @param options
     */
    async build(projectPath: string, options: Partial<IBuildCommandOption>) {
        if (!options.logDest) {
            options.logDest = join(projectPath, 'temp/build', getCurrentLocalTime() + '.log');
        }
        await newConsole.init(options.logDest);
        await newConsole.record();
        await newConsole.startProgress('Start build project...');

        // 先打开项目
        await this.open(projectPath);
        // 执行构建流程
        const { build } = await import('./builder');
        return await build(options);
    }
}

export const projectManager = new ProjectManager();
