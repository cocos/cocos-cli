import { Session } from 'inspector';
import * as fs from 'fs';
import { StartupCpuProfiler } from './startup-cpu-profiler';

jest.mock('inspector', () => ({
    Session: jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        post: jest.fn((method: string, callback: (error: Error | null, params?: object) => void) => {
            if (method === 'Profiler.stop') {
                callback(null, { profile: { nodes: [] } });
            } else {
                callback(null);
            }
        }),
    })),
}));

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
}));

const profileEnvKey = 'VSCODE_COCOS_SCENE_PROCESS_CPU_PROFILE';
const originalProfilePath = process.env[profileEnvKey];

afterEach(() => {
    jest.clearAllMocks();
    if (originalProfilePath === undefined) {
        delete process.env[profileEnvKey];
    } else {
        process.env[profileEnvKey] = originalProfilePath;
    }
});

it('runs transparently when the environment variable is not a .cpuprofile path', async () => {
    delete process.env[profileEnvKey];
    const task = jest.fn(async () => 'ready');

    const result = await new StartupCpuProfiler(profileEnvKey).run(task);

    expect(result).toBe('ready');
    expect(task).toHaveBeenCalledTimes(1);
    expect(Session).not.toHaveBeenCalled();
});

it('records startup and writes the profile to the configured path', async () => {
    const outputPath = '/tmp/scene-process.cpuprofile';
    process.env[profileEnvKey] = outputPath;
    const task = jest.fn(async () => 'ready');

    const result = await new StartupCpuProfiler(profileEnvKey).run(task);

    expect(result).toBe('ready');
    expect(task).toHaveBeenCalledTimes(1);
    expect(Session).toHaveBeenCalledTimes(1);
    const session = (Session as unknown as jest.Mock).mock.results[0].value;
    expect(session.connect).toHaveBeenCalledTimes(1);
    expect(session.post).toHaveBeenNthCalledWith(1, 'Profiler.enable', expect.any(Function));
    expect(session.post).toHaveBeenNthCalledWith(2, 'Profiler.start', expect.any(Function));
    expect(session.post).toHaveBeenNthCalledWith(3, 'Profiler.stop', expect.any(Function));
    expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, JSON.stringify({ nodes: [] }));
    expect(session.disconnect).toHaveBeenCalledTimes(1);
});
