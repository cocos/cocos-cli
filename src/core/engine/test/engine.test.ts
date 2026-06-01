import { Engine, IEngine } from '../index';
import { join } from 'path';
import { EngineLoader } from 'cc/loader.js';
import { TestGlobalEnv } from '../../../tests/global-env';
import type { IEngineProjectConfig } from '../@types/config';
import { configurationManager } from '../../configuration';

[
    'cc',
    'cc/editor/populate-internal-constants',
    'cc/editor/serialization',
    'cc/editor/new-gen-anim',
    'cc/editor/embedded-player',
    'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils',
    'cc/editor/material',
    'cc/editor/2d-misc',
    'cc/editor/offline-mappings',
    'cc/editor/custom-pipeline',
    'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation',
    'cc/editor/new-gen-anim',
    'cc/editor/offline-mappings',
    'cc/editor/embedded-player',
    'cc/editor/color-utils',
].forEach((module) => {
    jest.mock(module, () => {
        return EngineLoader.getEngineModuleById(module);
    }, { virtual: true });
});

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    let engine: IEngine;

    beforeEach(async () => {
        await configurationManager.initialize(TestGlobalEnv.projectRoot);
        // 在每个测试用例之前初始化 engine
        engine = await Engine.init(TestGlobalEnv.engineRoot);
    });

    it('test engine initEngine', async () => {
        await engine.initEngine({
            importBase: join(TestGlobalEnv.projectRoot, 'library'),
            nativeBase: join(TestGlobalEnv.projectRoot, 'library'),
            writablePath: join(TestGlobalEnv.projectRoot, 'temp'),
        });
        // @ts-ignore
        expect(cc).toBeDefined();
        // @ts-ignore
        expect(ccm).toBeDefined();
    }, 1000 * 60 * 50);

    it('getConfig should expose the selected module config at top level', () => {
        const config = Engine.getConfig() as ReturnType<typeof Engine.getConfig> & IEngineProjectConfig;
        const selectedConfigKey = config.globalConfigKey || Object.keys(config.configs || {})[0];

        expect(selectedConfigKey).toBeDefined();
        expect(config.configs?.[selectedConfigKey]).toBeDefined();
        expect(config.includeModules).toEqual(config.configs![selectedConfigKey].includeModules);
        expect(config.flags).toEqual(config.configs![selectedConfigKey].flags);
        expect(config.noDeprecatedFeatures).toEqual(config.configs![selectedConfigKey].noDeprecatedFeatures);
    });

    it('getConfig should return updated config after _configInstance.set()', async () => {
        const configInstance = Engine['_configInstance'];
        const projectConfig = configInstance.getAll() as Partial<IEngineProjectConfig> | undefined;
        const originalDesignResolution = projectConfig?.designResolution
            ? { ...projectConfig.designResolution }
            : undefined;
        const nextWidth = (Engine.getConfig().designResolution?.width || 0) + 1;

        try {
            await configInstance.set('designResolution.width', nextWidth);

            // Save 事件同步更新 _config 缓存，getConfig 应返回新值
            expect(Engine.getConfig().designResolution.width).toBe(nextWidth);
        } finally {
            if (originalDesignResolution) {
                await configInstance.set('designResolution', originalDesignResolution);
            } else {
                await configInstance.remove('designResolution');
            }
            await configurationManager.save(true);
        }
    }, 30000);
});
