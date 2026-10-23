import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildProfiler, enableBuildProfile, profiled, IBuildProfileReport } from '../profile';

describe('builder profile report', () => {
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-profile-'));
        delete process.env.COCOS_BUILD_PROFILE;
        buildProfiler.disable();
    });

    afterEach(async () => {
        delete process.env.COCOS_BUILD_PROFILE;
        buildProfiler.disable();
        await rm(tempRoot, { recursive: true, force: true });
    });

    function fakeLogDest(taskId = '123456') {
        return join(tempRoot, 'logs', `web-mobile-build-${taskId}.log`);
    }

    it('is a no-op when not enabled', async () => {
        buildProfiler.beginBuild({ taskId: 't0', platform: 'web-mobile', logDest: fakeLogDest('t0') });
        const token = buildProfiler.startEntry('some-task');
        expect(token).toBeNull();
        buildProfiler.endEntry(token);
        const reportPath = await buildProfiler.endBuild({ success: true });
        expect(reportPath).toBeNull();
    });

    it('records nested entries with stage scopes and writes report next to log file', async () => {
        enableBuildProfile();
        const logDest = fakeLogDest('task-1');
        buildProfiler.beginBuild({ taskId: 'task-1', taskName: 'web-mobile', platform: 'web-mobile', logDest });

        await profiled('buildTasks', async () => {
            await profiled('build-task/script', async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
            });
            const token = buildProfiler.startEntry('build-task/asset');
            await new Promise((resolve) => setTimeout(resolve, 5));
            buildProfiler.endEntry(token);
        });

        const reportPath = await buildProfiler.endBuild({ success: true, code: 0, dest: join(tempRoot, 'build') });

        expect(reportPath).toBe(join(tempRoot, 'logs', 'profile-task-1.json'));
        const report: IBuildProfileReport = JSON.parse(await readFile(reportPath!, 'utf8'));

        expect(report.meta.taskId).toBe('task-1');
        expect(report.meta.platform).toBe('web-mobile');
        expect(report.meta.success).toBe(true);
        expect(report.meta.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(report.meta.env.cpuCount).toBeGreaterThan(0);

        const names = report.entries.map((entry) => entry.name);
        expect(names).toContain('buildTasks');
        expect(names).toContain('build-task/script');
        expect(names).toContain('build-task/asset');

        const scriptEntry = report.entries.find((entry) => entry.name === 'build-task/script')!;
        expect(scriptEntry.stage).toBe('buildTasks');
        expect(scriptEntry.durationMs).toBeGreaterThanOrEqual(0);
        expect(scriptEntry.rssStartMB).toBeGreaterThan(0);
        expect(scriptEntry.heapUsedStartMB).toBeGreaterThan(0);

        const buildTasksEntry = report.entries.find((entry) => entry.name === 'buildTasks')!;
        expect(buildTasksEntry.stage).toBe('');
        expect(buildTasksEntry.durationMs).toBeGreaterThanOrEqual(scriptEntry.durationMs);

        expect(report.summary.byStage['buildTasks'].count).toBe(2);
        expect(report.summary.top.length).toBeGreaterThan(0);
        expect(report.summary.top[0].durationMs).toBeGreaterThan(0);
    });

    it('records error and flushes unclosed entries on failed build', async () => {
        enableBuildProfile();
        const logDest = fakeLogDest('task-2');
        buildProfiler.beginBuild({ taskId: 'task-2', platform: 'android', logDest });

        await expect(profiled('failing-task', async () => {
            throw new Error('boom');
        })).rejects.toThrow('boom');

        // 未闭合的 entry（模拟构建中途异常返回）
        buildProfiler.startEntry('unclosed-task');

        const reportPath = await buildProfiler.endBuild({ success: false, code: 1, reason: 'Build failed!' });
        const report: IBuildProfileReport = JSON.parse(await readFile(reportPath!, 'utf8'));

        expect(report.meta.success).toBe(false);
        expect(report.meta.code).toBe(1);
        expect(report.meta.reason).toBe('Build failed!');

        const failed = report.entries.find((entry) => entry.name === 'failing-task')!;
        expect(failed.error).toBe('boom');

        const unclosed = report.entries.find((entry) => entry.name === 'unclosed-task')!;
        expect(unclosed.error).toContain('unclosed');
    });

    it('is enabled by COCOS_BUILD_PROFILE env without explicit enable', async () => {
        process.env.COCOS_BUILD_PROFILE = '1';
        const logDest = fakeLogDest('task-3');
        buildProfiler.beginBuild({ taskId: 'task-3', platform: 'web-desktop', logDest });
        await profiled('env-task', async () => { /* noop */ });
        const reportPath = await buildProfiler.endBuild({ success: true, code: 0 });
        expect(reportPath).toBe(join(tempRoot, 'logs', 'profile-task-3.json'));
    });

    it('resets state between builds in the same process', async () => {
        enableBuildProfile();
        buildProfiler.beginBuild({ taskId: 'task-a', platform: 'web-mobile', logDest: fakeLogDest('task-a') });
        await profiled('task-a-entry', async () => { /* noop */ });
        await buildProfiler.endBuild({ success: true, code: 0 });

        buildProfiler.beginBuild({ taskId: 'task-b', platform: 'web-mobile', logDest: fakeLogDest('task-b') });
        await profiled('task-b-entry', async () => { /* noop */ });
        const reportPath = await buildProfiler.endBuild({ success: true, code: 0 });

        const report: IBuildProfileReport = JSON.parse(await readFile(reportPath!, 'utf8'));
        expect(report.meta.taskId).toBe('task-b');
        const names = report.entries.map((entry) => entry.name);
        expect(names).toEqual(['task-b-entry']);
    });
});
