import { Scene } from '../main-process';
import { join } from 'path';
import { EngineLoader } from 'cc/loader.js';

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

describe('Scene 测试', () => {
    const projectPath = join(__dirname, '../../../../test-project');
    const enginePath = require('../../../../.user.json').engine;

    it('启动场景进程', async () => {
        // 使用真实的引擎路径和项目路径启动场景进程
        const result = await Scene.worker.start(enginePath, projectPath);
        expect(result).toBe(true);
    });
    
});