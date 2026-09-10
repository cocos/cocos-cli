import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';

/** 真实引擎测试在独立进程运行，避免 EngineLoader 修改模块解析后影响其他测试 */
it('validates serialized nodes and Undo/Redo in an isolated real engine', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'cocos-node-data-results-'));
    const resultFile = join(outputDirectory, 'results.json');
    const root = resolve(__dirname, '../../../..');
    try {
        await promisify(execFile)(process.execPath, [
            join(root, 'node_modules/jest/bin/jest.js'),
            '--runInBand', '--runTestsByPath', join(__dirname, 'serialized-node-data.engine-test.ts'),
            '--testMatch', '**/serialized-node-data.engine-test.ts',
            '--json', '--outputFile', resultFile,
        ], { cwd: root, timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
        const result = JSON.parse(await readFile(resultFile, 'utf8'));
        expect(result.numFailedTests).toBe(0);
        expect(result.numPassedTests).toBeGreaterThan(0);
        console.info(`Real engine checks: ${result.numPassedTests} passed`);
    } catch (error) {
        const result = error as Error & { stdout?: string; stderr?: string };
        throw new Error(`${result.message}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    } finally {
        await rm(outputDirectory, { recursive: true, force: true });
    }
});
