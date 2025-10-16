import * as server from '../../../server';
import { configurationManager } from '../../configuration';
import Project from '../../project';
import { Engine, initEngine } from '../../engine';
import { startupAssetDB, assetManager } from '../../assets';
import { PackerDriver } from '../../scripting/packer-driver';
import { EngineLoader } from 'cc/loader';

/**
 * 快速启动主流，用于其他依赖主流程启动的单元测试
 */
let core: {
    server: typeof server,
    configurationManager: typeof configurationManager,
    project: typeof Project,
    engine: typeof Engine
    assetManager: typeof assetManager,
    packDriver: PackerDriver
} | undefined;

export async function fastStartup (enginePath: string, projectPath: string) {
    if (core) {
        // 如果已经启动过了就不在启动，直接返回
        return core;
    }

    [
        'cc',
        'cc/editor/populate-internal-constants',
        'cc/editor/serialization',
        'cc/editor/animation-clip-migration',
        'cc/editor/exotic-animation',
        'cc/editor/new-gen-anim',
        'cc/editor/offline-mappings',
        'cc/editor/embedded-player',
        'cc/editor/color-utils',
        'cc/editor/custom-pipeline',
    ].forEach((module) => {
        jest.mock(module, () => {
            return EngineLoader.getEngineModuleById(module);
        }, { virtual: true });
    });

    // 启动服务器
    await server.startServer();
    // 初始化配置
    await configurationManager.initialize(projectPath);
    // 打开项目
    await Project.open(projectPath);
    // 初始化引擎
    await initEngine(enginePath, projectPath);
    // 启动 db
    await startupAssetDB();
    // 初始化项目脚本
    const packDriver = await PackerDriver.create(projectPath, enginePath);
    await packDriver.init(Engine.getConfig().includeModules);

    core = {
        server: server,
        configurationManager: configurationManager,
        project: Project,
        engine: Engine,
        assetManager: assetManager,
        packDriver
    }
    return core;
}
