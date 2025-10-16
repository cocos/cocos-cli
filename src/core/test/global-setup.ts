import { engine as EnginPath } from '../../../.user.json';
import { join } from 'path';
import * as server from '../../server';
import { EngineLoader } from 'cc/loader.js';
import { Engine } from '../engine';
import { existsSync, remove } from 'fs-extra';
import utils from '../base/utils';
import { TestGlobalEnv } from './global-env';
import { PackerDriver } from '../scripting/packer-driver';
let hasInit = false;

export async function globalSetup() {
    // TODO 如果是异步多次调用，需要做队列管理
    if (hasInit) {
        return;
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
    console.log('start init engine with project root: ', TestGlobalEnv.projectRoot);
    /**
     * 初始化一些基础模块信息
     */
    utils.Path.register('project', {
        label: '项目',
        path: TestGlobalEnv.projectRoot,
    });
    // 启动服务器
    await server.startServer();
    const { configurationManager } = await import('../configuration');
    await configurationManager.initialize(TestGlobalEnv.projectRoot);
    // 初始化项目信息
    const { default: Project } = await import('../project');
    await Project.open(TestGlobalEnv.projectRoot);
    const engine = await Engine.init(EnginPath);
    await engine.initEngine({
        importBase: TestGlobalEnv.libraryPath,
        nativeBase: TestGlobalEnv.libraryPath,
        writablePath: join(TestGlobalEnv.projectRoot, 'temp'),
    });
    if (existsSync(TestGlobalEnv.libraryPath)) {
        try {
            await remove(TestGlobalEnv.libraryPath);
            console.log('remove project library cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project library cache fail');
        }
    }
    if (existsSync(TestGlobalEnv.testRoot)) {
        try {
            await remove(TestGlobalEnv.testRoot);
            console.log('remove project test root cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project test root cache fail');
        }
    }
    const { startupAssetDB } = await import('../assets');
    await startupAssetDB();
    console.log('startupAssetDB success');
    // 初始化项目脚本
    const packDriver = await PackerDriver.create(TestGlobalEnv.projectRoot, EnginPath);
    await packDriver.init(Engine.getConfig().includeModules);
    hasInit = true;

}

