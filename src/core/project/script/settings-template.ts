import { GlobalPaths } from '../../../global';
import { createDefaultEngineModuleSettings } from '../../engine/module-config-defaults';

export function createDefaultEngineSettings(engineRoot: string = GlobalPaths.enginePath) {
    return {
        '__version__': '1.0.12',
        'modules': createDefaultEngineModuleSettings(engineRoot),
    };
}

export const defaultEngineSettings = createDefaultEngineSettings();

export const defaultProjectSettings = {
    '__version__': '1.0.6',
    'general': {
        'designResolution': {
            'width': 960,
            'height': 640
        }
    },
    'script': {
        'preserveSymlinks': true
    }
};
