import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

import { SceneReadyChannel } from '../common';
import { SceneWorker } from '../main-process/scene-worker';

const mockFork = jest.fn();
const mockRpcStartup = jest.fn();
const mockListenModuleMessages = jest.fn();
const mockDisposeModuleMessages = jest.fn();
const mockGetAvailablePort = jest.fn(async (_port: number) => 9230);

jest.mock('child_process', () => ({
    fork: (...args: any[]) => mockFork(...args),
}));

jest.mock('../../../server', () => ({
    getServerUrl: jest.fn(() => 'http://localhost:7456'),
}));

jest.mock('../../../server/utils', () => ({
    getAvailablePort: (port: number) => mockGetAvailablePort(port),
}));

jest.mock('../main-process/rpc', () => ({
    Rpc: {
        startup: (...args: any[]) => mockRpcStartup(...args),
    },
}));

jest.mock('../main-process/messages', () => ({
    disposeModuleMessages: (...args: any[]) => mockDisposeModuleMessages(...args),
    listenModuleMessages: (...args: any[]) => mockListenModuleMessages(...args),
}));

class MockChildProcess extends EventEmitter {
    send = jest.fn();
    kill = jest.fn();
    stdout = new EventEmitter();
    stderr = new EventEmitter();
}

function createEpipeError(): NodeJS.ErrnoException {
    const error = new Error('write EPIPE') as NodeJS.ErrnoException;
    error.code = 'EPIPE';
    return error;
}

describe('SceneWorker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetAvailablePort.mockResolvedValue(9230);
    });

    it('returns true when stop gets EPIPE before exit during manual shutdown', async () => {
        const worker = new SceneWorker();
        const process = new MockChildProcess();
        (worker as any)._process = process as unknown as ChildProcess;

        const stopPromise = worker.stop();

        process.emit('error', createEpipeError());
        process.emit('exit', 0, null);

        await expect(stopPromise).resolves.toBe(true);
        expect(process.send).toHaveBeenCalledWith(SceneWorker.ExitWorkerEvent);
        expect(mockDisposeModuleMessages).toHaveBeenCalledTimes(2);
    });

    it('waits for module message listeners before resolving startup', async () => {
        const worker = new SceneWorker();
        const process = new MockChildProcess();
        mockFork.mockReturnValue(process);

        let resolveListeners!: () => void;
        mockListenModuleMessages.mockReturnValue(new Promise<void>((resolve) => {
            resolveListeners = resolve;
        }));

        const startPromise = worker.start('/engine', '/project');
        await Promise.resolve();

        process.emit('message', SceneReadyChannel);

        let settled = false;
        startPromise.then(() => {
            settled = true;
        });
        await Promise.resolve();

        expect(settled).toBe(false);

        resolveListeners();

        await expect(startPromise).resolves.toBe(true);
        expect(mockRpcStartup).toHaveBeenCalledWith(process);
        expect(mockListenModuleMessages).toHaveBeenCalledTimes(1);
    });
});
