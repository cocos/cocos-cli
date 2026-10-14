import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';

// EngineLoader changes Node module resolution. Keep the real-engine fixture in a
// child Jest process, as the scene serialized-node-data tests do.
it('keeps a real headless Canvas and camera aligned with project dimensions', async () => {
    const output = await mkdtemp(join(tmpdir(), 'cocos-resolution-results-'));
    const resultFile = join(output, 'results.json');
    const root = resolve(__dirname, '../../../..');
    try {
        await promisify(execFile)(process.execPath, [
            join(root, 'node_modules/jest/bin/jest.js'),
            '--runInBand', '--runTestsByPath', join(__dirname, 'headless-design-resolution.engine-test.ts'),
            '--testMatch', '**/headless-design-resolution.engine-test.ts',
            '--cacheDirectory', join(output, 'jest-cache'),
            '--json', '--outputFile', resultFile,
        ], { cwd: root, timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
        const result = JSON.parse(await readFile(resultFile, 'utf8'));
        expect(result.numFailedTests).toBe(0);
        expect(result.numPassedTests).toBe(1);
    } catch (error) {
        const result = error as Error & { stdout?: string; stderr?: string };
        throw new Error(`${result.message}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    } finally {
        await rm(output, { recursive: true, force: true });
    }
}, 100000);
