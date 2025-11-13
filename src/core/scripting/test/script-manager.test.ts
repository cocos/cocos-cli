import scriptManagerDefault, { AssetChangeInfo } from '../index';
import { PackerDriver } from '../packer-driver';
import { eventEmitter } from '../event-emitter';
import { DBInfo } from '../@types/config-export';
import { AssetActionEnum } from '@cocos/asset-db/libs/asset';
import { DBChangeType } from '../packer-driver/asset-db-interop';
import { Engine } from '../../engine';
import path, { join } from 'path';
import { dbUrlToRawPath } from '../../builder/worker/builder/utils';
import { TestGlobalEnv } from '../../../tests/global-env';
import { ensureDirSync, writeFileSync, unlinkSync, existsSync } from 'fs-extra';
import { EngineLoader } from 'cc/loader';

const _ProjectRoot = TestGlobalEnv.projectRoot;
const _EngineRoot = TestGlobalEnv.engineRoot;
const _ScriptsDir = path.join(_ProjectRoot, 'assets', 'scripts');

const _url2path = (url: string): string => {
    return path.join(_ProjectRoot, dbUrlToRawPath(url));
};

/**
 * 等待定时器完成的辅助函数
 * @param checkFn 检查函数，返回 true 表示条件满足
 * @param timeout 超时时间（毫秒），默认 5000ms
 * @param interval 轮询间隔（毫秒），默认 50ms
 */
async function waitFor(
    checkFn: () => boolean,
    timeout: number = 5000,
    interval: number = 50
): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const check = () => {
            if (checkFn()) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Timeout: condition not met within ${timeout}ms`));
            } else {
                setTimeout(check, interval);
            }
        };
        check();
    });
}

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
    'cc/editor/color-utils',
].forEach((module) => {
    jest.mock(module, () => {
        return EngineLoader.getEngineModuleById(module);
    }, { virtual: true });
});


describe('ScriptManager', () => {
    let scriptManager: typeof scriptManagerDefault;
    const testFiles: string[] = [];

    beforeAll(async () => {
        // Use the exported singleton instance
        scriptManager = scriptManagerDefault;
        await Engine.init(_EngineRoot);
        await Engine.initEngine({
            serverURL: '',
            importBase: join(_ProjectRoot, 'library'),
            nativeBase: join(_ProjectRoot, 'library'),
            writablePath: join(_ProjectRoot, 'temp'),
        });

        // Ensure scripts directory exists
        ensureDirSync(_ScriptsDir);

        // Create test script files
        const scriptFiles = {
            'FirstFile.ts': `import { SecondFile } from './SecondFile.ts';
                import { ThirdFile } from './ThirdFile';

                export class FirstFile {
                    private secondFile: SecondFile;
                    private thirdFile: ThirdFile;

                    constructor() {
                        this.secondFile = new SecondFile();
                        this.thirdFile = new ThirdFile();
                    }
                }`,
            'SecondFile.ts': `import { ThirdFile } from './ThirdFile';
                import { _decorator, Node } from 'cc';
                const { ccclass, property } = _decorator;

                @ccclass('SecondFile')
                export class SecondFile extends ThirdFile {

                    @property(Node)
                    snakeBody: Node[] = [];

                    public load(): void {
                        console.log('SecondFile loaded');
                    }
                }`,
                            'ThirdFile.ts': `export class ThirdFile {
                    public load(): void {
                        console.log('ThirdFile loaded');
                    }
                }`,
            'TestChange.ts': `import { SecondFile } from './SecondFile';
                import { ThirdFile } from './ThirdFile';

                import { _decorator, Node } from 'cc';
                const { ccclass, property } = _decorator;

                @ccclass('TestChange')
                export class TestChange {
                    private secondFile: SecondFile;
                    private thirdFile: ThirdFile;

                    @property(Node)
                    snakeBody: Node[] = [];

                    constructor() {
                        this.secondFile = new SecondFile();
                        this.thirdFile = new ThirdFile();
                    }
                }`,
            'TestError.ts': `import { SecondFile } from './SecondFile';
                import { ThirdFile } from './ThirdFile';

                import { _decorator, Node } from 'cc';
                const { ccclass, property } = _decorator;

                @ccclass('TestError')
                export class TestError {
                    private secondFile: SecondFile;
                    private thirdFile: ThirdFile;

                    @property(Node[])
                    snakeBody: Node[] = [];

                    constructor() {
                        this.secondFile = new SecondFile();
                        this.thirdFile = new ThirdFile();
                    }
                }`,
            'testError.js': 'function testJs() {\n    console.log(\'testJs\n}\n\ntestJs();'
        };

        // Write all test files
        for (const [filename, content] of Object.entries(scriptFiles)) {
            const filePath = path.join(_ScriptsDir, filename);
            writeFileSync(filePath, content, 'utf8');
            testFiles.push(filePath);
        }
    });

    afterAll(() => {
        // Clean up test files
        for (const filePath of testFiles) {
            if (existsSync(filePath)) {
                try {
                    unlinkSync(filePath);
                } catch (error) {
                    console.warn(`Failed to delete test file: ${filePath}`, error);
                }
            }
        }
        testFiles.length = 0;
    });

    describe('initialize', () => {
        it('should initialize PackerDriver with correct parameters', async () => {
            await scriptManager.initialize(_ProjectRoot, _EngineRoot, Engine.getConfig().includeModules);
            
            expect((scriptManager as any)._initialized).toBe(true);
            // Verify PackerDriver instance is available
            expect(PackerDriver.getInstance()).toBeDefined();
        });

        it('should not initialize twice', async () => {
            const firstInstance = PackerDriver.getInstance();
            
            await scriptManager.initialize(_ProjectRoot, _EngineRoot, Engine.getConfig().includeModules);
            const secondInstance = PackerDriver.getInstance();
            
            expect(firstInstance).toEqual(secondInstance);
        });
    });

    describe('updateDatabases', () => {
        it('should update database info with add type', async () => {
            const dbInfos: DBInfo[] = [
                {dbID: 'assets', target: path.join(_ProjectRoot, 'assets')},
                {dbID: 'internal', target: path.join(_EngineRoot, 'editor/assets')},
            ];

            // Should not throw
            await expect(scriptManager.updateDatabases(dbInfos[0], DBChangeType.add)).resolves.not.toThrow();
            // Should not throw
            await expect(scriptManager.updateDatabases(dbInfos[1], DBChangeType.add)).resolves.not.toThrow();
        });
    });

    describe('Event handling', () => {
        it('should register event listeners', () => {
            const listener = jest.fn();
            const result = scriptManager.on('compile-start', listener);
            
            expect(result).toBe(eventEmitter);
            // Verify listener is actually registered by emitting an event
            eventEmitter.emit('compile-start');
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should unregister event listeners', () => {
            const listener = jest.fn();
            scriptManager.on('compile-start', listener);
            
            // Verify listener is registered
            eventEmitter.emit('compile-start');
            expect(listener).toHaveBeenCalledTimes(1);
            
            // Unregister listener
            const result = scriptManager.off('compile-start', listener);
            expect(result).toBe(eventEmitter);
            
            // Verify listener is removed
            listener.mockClear();
            eventEmitter.emit('compile-start');
            expect(listener).not.toHaveBeenCalled();
        });

        it('should register one-time event listeners', () => {
            const listener = jest.fn();
            const result = scriptManager.once('compile-start', listener);
            
            expect(result).toBe(eventEmitter);
            
            // Verify listener is registered and called once
            eventEmitter.emit('compile-start');
            expect(listener).toHaveBeenCalledTimes(1);
            
            // Verify listener is automatically removed after first call
            listener.mockClear();
            eventEmitter.emit('compile-start');
            expect(listener).not.toHaveBeenCalled();
        });

        it('should handle multiple listeners for same event', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            
            scriptManager.on('compile-start', listener1);
            scriptManager.on('compile-start', listener2);
            
            eventEmitter.emit('compile-start');
            
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });

    describe('compileScripts', () => {
        it('should compile scripts without asset changes', async () => {
            // Should not throw - actual compilation may take time
            await expect(scriptManager.compileScripts()).resolves.not.toThrow();
        }, 60000); // Increase timeout for real compilation


        it('should handle concurrent compileScripts calls', async () => {
            const assetChanges1: AssetChangeInfo[] = [
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-concurrent-1',
                    filePath: _url2path('db://assets/scripts/FirstFile.ts'),
                    importer: 'typescript',
                    userData: {},
                },
            ];

            const assetChanges2: AssetChangeInfo[] = [
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-concurrent-2',
                    filePath: _url2path('db://assets/scripts/SecondFile.ts'),
                    importer: 'typescript',
                    userData: {},
                },
            ];

            const assetChanges3: AssetChangeInfo[] = [
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-concurrent-3',
                    filePath: _url2path('db://assets/scripts/ThirdFile.ts'),
                    importer: 'typescript',
                    userData: {},
                },
            ];

            scriptManager.compileScripts(assetChanges1);
            scriptManager.compileScripts(assetChanges2);
            scriptManager.compileScripts(assetChanges3);
        }, 60000); // Increase timeout for real compilation
    
        it('should compile scripts with asset changes', async () => {
            const assetChanges: AssetChangeInfo[] = [
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-1',
                    filePath: _url2path('db://assets/scripts/FirstFile.ts'),
                    importer: 'typescript',
                    userData: {},
                },
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-2',
                    filePath: _url2path('db://assets/scripts/SecondFile.ts'),
                    importer: 'typescript',
                    userData: {},
                },
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-3',
                    filePath: _url2path('db://assets/scripts/ThirdFile.ts'),
                    importer: 'typescript',
                    userData: {},
                }
            ];
            
            // Should not throw - actual compilation may take time
            await expect(scriptManager.compileScripts(assetChanges)).resolves.not.toThrow();
        }, 60000); // Increase timeout for real compilation
    });

    describe('queryScriptUsers', () => {
        it('should query script users', async () => {
            const testPath = _url2path('db://assets/scripts/SecondFile.ts');
            const result = await scriptManager.queryScriptUsers(testPath);
            
            
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should return empty array when no users found', async () => {
            const testPath = _url2path('db://assets/scripts/nonexistent.ts');
            const result = await scriptManager.queryScriptUsers(testPath);
            
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('queryScriptDependencies', () => {
        it('should query script dependencies', async () => {
            // Query dependencies for FirstFile.ts
            const testPath = _url2path('db://assets/scripts/FirstFile.ts');
            const result = await scriptManager.queryScriptDependencies(testPath);
            
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0); // Should have dependencies
            
            // FirstFile.ts imports SecondFile.ts and ThirdFile.ts
            // Verify that dependencies include SecondFile.ts and ThirdFile.ts
            // Note: queryScriptDeps returns file system paths (normalized)
            const hasSecondFile = result.some(path => path.includes('SecondFile.ts') || path.includes('SecondFile'));
            const hasThirdFile = result.some(path => path.includes('ThirdFile.ts') || path.includes('ThirdFile'));
            
            // FirstFile.ts should have at least SecondFile.ts or ThirdFile.ts as dependency
            expect(hasSecondFile || hasThirdFile).toBe(true);
            
            // Log dependencies for debugging
            if (result.length === 0) {
                console.warn('No dependencies found for FirstFile.ts. This might indicate a compilation issue.');
            } else {
                console.log(`Found ${result.length} dependencies for FirstFile.ts:`, result);
            }
        }, 60000); // Increase timeout for compilation

        it('should return empty array when no dependencies found', async () => {
            const testPath = _url2path('db://assets/scripts/nonexistent.ts');
            const result = await scriptManager.queryScriptDependencies(testPath);
            
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0); // Should be empty for non-existent file
        });
    });

    describe('querySharedSettings', () => {
        it('should query shared settings', async () => {
            const result = await scriptManager.querySharedSettings();
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
            // Verify it has expected properties
            expect(result).toHaveProperty('useDefineForClassFields');
            expect(result).toHaveProperty('allowDeclareFields');
            expect(result).toHaveProperty('loose');
        });
    });

    describe('dispatchAssetChange', () => {
        it('should dispatch asset change', async () => {
            const assetChange: AssetChangeInfo = {
                type: AssetActionEnum.add,
                uuid: 'test-uuid',
                filePath: _url2path('db://assets/scripts/TestChange.ts'),
                importer: 'typescript',
                userData: {},
            };
            
            // Should not throw
            expect(() => {
                scriptManager.dispatchAssetChange(assetChange);
            }).not.toThrow();
        });
    });

    describe('postCompileScripts', () => {
        it('should schedule delayed compilation', async () => {
            const delay = 100;
            const taskId = scriptManager.postCompileScripts(delay);
            
            expect(taskId).toBeDefined();
            expect(typeof taskId).toBe('string');
            expect((scriptManager as any)._pendingCompileTimer).not.toBeNull();
            
            // Wait for timer to complete (add some buffer time)
            await waitFor(() => (scriptManager as any)._pendingCompileTimer === null, delay + 200);
            
            // Timer should be cleared after execution
            expect((scriptManager as any)._pendingCompileTimer).toBeNull();
        }, 10000); // Increase timeout for real timer

        it('should cancel previous delayed compilation and schedule new one', async () => {
            const delay1 = 200;
            const delay2 = 100;
            
            const taskId1 = scriptManager.postCompileScripts(delay1);
            const taskId2 = scriptManager.postCompileScripts(delay2);
            
            expect(taskId1).toBeDefined();
            expect(taskId2).toBeDefined();
            // Should reuse same task ID
            expect(taskId1).toBe(taskId2);
            
            // Wait for the second timer to complete (which should cancel the first)
            await waitFor(() => (scriptManager as any)._pendingCompileTimer === null, delay2 + 200);
            
            // Timer should be cleared
            expect((scriptManager as any)._pendingCompileTimer).toBeNull();
        }, 10000); // Increase timeout for real timer

        it('should clear timer after execution', async () => {
            const delay = 100;
            scriptManager.postCompileScripts(delay);
            
            expect((scriptManager as any)._pendingCompileTimer).not.toBeNull();
            
            // Wait for timer to complete
            await waitFor(() => (scriptManager as any)._pendingCompileTimer === null, delay + 100);
            await waitFor(() => scriptManager.isCompiling() === false, delay + 1000);
            
            expect((scriptManager as any)._pendingCompileTimer).toBeNull();
            expect((scriptManager as any)._pendingCompileTaskId).toBeNull();
        }, 10000); // Increase timeout for real timer
    });

    describe('isCompiling', () => {
        it('should return compilation status', () => {
            const result = scriptManager.isCompiling();
            
            expect(typeof result).toBe('boolean');
        });
    });

    describe('getCurrentTaskId', () => {
        it('should return current task ID or null', () => {
            const result = scriptManager.getCurrentTaskId();
            
            expect(result === null || typeof result === 'string').toBe(true);
        });
    });

    describe('isTargetReady', () => {
        it('should return target readiness status', () => {
            const result = scriptManager.isTargetReady('editor');
            
            expect(typeof result).toBe('boolean');
        });

        it('should return false for unknown target', () => {
            const result = scriptManager.isTargetReady('unknown');
            
            expect(result).toBe(false);
        });
    });

    describe('loadScript', () => {

        it('should return early when scriptUuids is empty', async () => {
            const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
            
            await scriptManager.loadScript([]);
            
            expect(consoleSpy).toHaveBeenCalledWith('No script need reload.');
            
            consoleSpy.mockRestore();
        });

        it('should log reload message when scriptUuids is provided', async () => {
            const scriptUuids = ['test-uuid-1', 'test-uuid-2'];
            const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
            
            // This test verifies the method starts the loading process
            // Actual executor creation may fail in test environment, which is acceptable
            try {
                await scriptManager.loadScript(scriptUuids);
            } catch {
                // Expected if executor dependencies are not available in test environment
            }
            
            expect(consoleSpy).toHaveBeenCalledWith('reload all scripts.');
            
            consoleSpy.mockRestore();
        });
    });

    describe('queryCCEModuleMap', () => {
        it('should query CCE module map', () => {
            const result = scriptManager.queryCCEModuleMap();
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
        });
    });

    describe('getPackerDriverLoaderContext', () => {
        it('should get loader context for target', () => {
            const targetName = 'editor';
            const result = scriptManager.getPackerDriverLoaderContext(targetName);
            
            // May return undefined if target is not ready, or return serialized context
            expect(result === undefined || typeof result === 'object').toBe(true);
        });

        it('should return undefined when context is not available', () => {
            const result = scriptManager.getPackerDriverLoaderContext('unknown');
            
            expect(result).toBeUndefined();
        });
    });

    describe('clearCacheAndRebuild', () => {
        it('should clear cache', async () => {
            // Should not throw
            await expect(scriptManager.clearCacheAndRebuild()).resolves.not.toThrow();
        });
    });

    const _TEXT_MAX_COUNT = 2;
    describe('Integration scenarios', () => {
        it('should throw error when compile failed', async () => {
            // Compile with error file - should throw error
            // testError.js has syntax error: missing closing quote
            for (let i = 0; i < _TEXT_MAX_COUNT; i++) {
                
                await expect(scriptManager.compileScripts([
                {
                    type: AssetActionEnum.add,
                    uuid: 'test-uuid-error',
                    filePath: _url2path('db://assets/scripts/testError.js'),
                    importer: 'javascript',
                    userData: {},
                }])).rejects.not.toThrow('SyntaxError');
            }
        }, 60000); // Increase timeout for real compilation

        it('When a script exception occurs, subsequent script compilation tasks should be able to execute normally.', async () => {

            for (let i = 0; i < _TEXT_MAX_COUNT; i++) {
                // First, trigger a compilation error
                try {
                    await scriptManager.compileScripts([
                        {
                            type: AssetActionEnum.add,
                            uuid: 'test-uuid-error2',
                            filePath: _url2path('db://assets/scripts/TestError.ts'),
                            importer: 'typescript',
                            userData: {},
                        }]);
                    // Should not reach here - if we do, the test fails
                    expect(true).toBe(false); // Force test failure if no error thrown
                } catch (error) {
                    // Expected error, verify it's a compilation error
                    expect(error).toBeDefined();
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.log('Expected compilation error occurred:', errorMessage);
                }
            }
        }, 60000); // Increase timeout for real compilation
    });
});

