import { readFileSync, writeFileSync, realpathSync } from 'fs';
import { relative } from 'path';
import { TestGlobalEnv } from '../../../tests/global-env';
import { globalSetup } from '../../test/global-setup';
import { Engine } from '../index';
import { getEngineBackendAdapter } from '../adapter';
import { EngineLoader } from 'cc/loader.js';

it('loads the requested adapter and runtime version rather than the default engine', async () => {
    await globalSetup();
    const path = realpathSync(TestGlobalEnv.engineRoot);
    const version = JSON.parse(readFileSync(path + '/package.json', 'utf8')).version;
    const adapter = getEngineBackendAdapter({ path, version });
    const { expectedRuntimeVersion } = require('../../../../workflow/engine-test-identity.cjs');
    const declaredRuntimeVersion = expectedRuntimeVersion(path, version);
    const engine = EngineLoader.getEngineModuleById('cc');
    expect(Engine.getInfo().version).toBe(version);
    expect(engine.VERSION).toBe(declaredRuntimeVersion);
    expect(relative(path, realpathSync(Engine.getInfo().typescript.path))).toBe('');
    if (process.env.COCOS_TEST_ENGINE_VERSION) {
        expect(version).toBe(process.env.COCOS_TEST_ENGINE_VERSION);
        expect(adapter.id).toBe(process.env.COCOS_TEST_ADAPTER_ID);
    }
    const report = { adapter: adapter.id, version, path, runtimeVersion: engine.VERSION, declaredRuntimeVersion };
    console.log('[Adapter Runtime Identity]', JSON.stringify(report));
    if (process.env.COCOS_TEST_IDENTITY_REPORT) writeFileSync(process.env.COCOS_TEST_IDENTITY_REPORT, JSON.stringify(report));
});
