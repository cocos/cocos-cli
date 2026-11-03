import { realpathSync, readFileSync } from 'fs';
import { setEnginePathOverride } from '../../global';
import { getEngineBackendAdapter } from '../engine/adapter';

// Run before test modules capture TestGlobalEnv or import an engine.
const enginePath = process.env.COCOS_TEST_ENGINE_PATH;
if (!enginePath) throw new Error('Adapter Jest runs require COCOS_TEST_ENGINE_PATH');
const selected = realpathSync(enginePath);
const version = JSON.parse(readFileSync(selected + '/package.json', 'utf8')).version;
const adapter = getEngineBackendAdapter({ path: selected, version });
if (version !== process.env.COCOS_TEST_ENGINE_VERSION || adapter.id !== process.env.COCOS_TEST_ADAPTER_ID) {
    throw new Error('Adapter test target identity changed before startup');
}
setEnginePathOverride(selected);
