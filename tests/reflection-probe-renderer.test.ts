const mockFetchSockets = jest.fn();
const mockIn = jest.fn(() => ({ fetchSockets: mockFetchSockets }));

jest.mock('../src/server/socket', () => ({
    SCENE_RENDERER_ROOM: 'scene-renderer',
    socketService: { io: { in: mockIn } },
}));

import { reflectionProbeRenderer } from '../src/core/scene/main-process/reflection-probe-renderer';

function rendererSocket(sceneUrl: string, resolution = 64) {
    const socket = {
        data: { sceneUrl },
        timeout: jest.fn(),
        emit: jest.fn((_event, _request, reply) => {
            reply(null, { result: { resolution, faces: Array(6).fill('pixels') } });
        }),
    };
    socket.timeout.mockReturnValue(socket);
    return socket;
}

describe('reflection probe WebGL renderer selection', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses the renderer room and selects only the client with the requested scene', async () => {
        const other = rendererSocket('db://assets/Other.scene');
        const matching = rendererSocket('db://assets/Target.scene');
        mockFetchSockets.mockResolvedValue([other, matching]);

        await expect(reflectionProbeRenderer.capture(
            'db://assets/Target.scene',
            'Probe',
            1000,
        )).resolves.toMatchObject({ resolution: 64 });

        expect(mockIn).toHaveBeenCalledWith('scene-renderer');
        expect(matching.emit).toHaveBeenCalledTimes(1);
        expect(other.emit).not.toHaveBeenCalled();
    });

    it('fails without a registered WebGL renderer', async () => {
        mockFetchSockets.mockResolvedValue([]);
        await expect(reflectionProbeRenderer.capture(
            'db://assets/Target.scene',
            'Probe',
            1000,
        )).rejects.toThrow('requires a WebGL scene renderer');
    });
});
