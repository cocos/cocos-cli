const mockDebug = jest.fn();

jest.mock('../../base/console', () => ({
    newConsole: {
        debug: mockDebug,
    },
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Math: {
            clamp01: jest.fn((value: number) => Math.max(0, Math.min(1, value))),
        },
        File: {
            requireFile: jest.fn(),
        },
    },
}));

import { BuildTaskBase } from '../worker/builder/manager/task-base';

class TestBuildTask extends BuildTaskBase {
    public hooksInfo = {
        pkgNameOrder: [],
        infos: {},
    } as any;
    public options = {} as any;
    public hookMap = {};

    async handleHook() {}

    async run() {
        return true;
    }

    public disableProgressHeartbeat() {
        this.progressHeartbeatEnabled = false;
    }

    public startStep(message: string, stepWeight: number) {
        this.startProgressStep(message, stepWeight);
    }
}

describe('BuildTaskBase progress heartbeat', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('advances displayed progress during heartbeat without changing real progress', () => {
        const task = new TestBuildTask('task-id', 'build');
        const updates: Array<{ message: string; progress: number }> = [];
        task.on('update', (message: string, progress: number) => {
            updates.push({ message, progress });
        });

        task.startStep('Build assets', 0.25);
        jest.advanceTimersByTime(60 * 1000 - 1);

        expect(updates).toEqual([
            { message: 'Build assets', progress: 0 },
        ]);

        jest.advanceTimersByTime(1);

        expect(updates).toEqual([
            { message: 'Build assets', progress: 0 },
            { message: 'Still running: Build assets', progress: 0.01 },
        ]);
        expect(task.progress).toBe(0);
        expect(mockDebug).toHaveBeenLastCalledWith('Still running: Build assets (1%)');

        jest.advanceTimersByTime(60 * 1000);

        expect(updates).toEqual([
            { message: 'Build assets', progress: 0 },
            { message: 'Still running: Build assets', progress: 0.01 },
            { message: 'Still running: Build assets', progress: 0.02 },
        ]);

        task.updateProcess('Build assets success', 0.25);

        expect(updates[updates.length - 1]).toEqual({
            message: 'Build assets success',
            progress: 0.25,
        });
        expect(task.progress).toBe(0.25);

        task.break('stop heartbeat');
    });

    it('stops heartbeat after task is broken', () => {
        const task = new TestBuildTask('task-id', 'build');
        const updates: Array<{ message: string; progress: number }> = [];
        task.on('update', (message: string, progress: number) => {
            updates.push({ message, progress });
        });

        task.startStep('Build assets', 0.25);
        task.break('stop heartbeat');
        jest.advanceTimersByTime(60 * 1000);

        expect(updates).toEqual([
            { message: 'Build assets', progress: 0 },
        ]);
    });

    it('does not emit heartbeat when heartbeat is disabled', () => {
        const task = new TestBuildTask('task-id', 'build');
        const updates: Array<{ message: string; progress: number }> = [];
        task.disableProgressHeartbeat();
        task.on('update', (message: string, progress: number) => {
            updates.push({ message, progress });
        });

        task.startStep('Build assets', 0.25);
        jest.advanceTimersByTime(60 * 1000);

        expect(updates).toEqual([
            { message: 'Build assets', progress: 0 },
        ]);
    });

    it('does not let heartbeat progress exceed the current step ceiling', () => {
        const task = new TestBuildTask('task-id', 'build');
        const updates: Array<{ message: string; progress: number }> = [];
        task.on('update', (message: string, progress: number) => {
            updates.push({ message, progress });
        });

        task.startStep('Build assets', 0.1);
        for (let i = 0; i < 30; i++) {
            jest.advanceTimersByTime(60 * 1000);
        }

        expect(updates[updates.length - 1].progress).toBeCloseTo(0.09);
        expect(task.progress).toBe(0);

        task.break('stop heartbeat');
    });
});
