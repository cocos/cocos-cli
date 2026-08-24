const mockSetCommandProvider = jest.fn();
const mockResetCommandProvider = jest.fn();

jest.mock('../src/core/scene', () => ({
    init: jest.fn(),
}));

jest.mock('../src/core/scene/main-process/rpc', () => ({
    Rpc: {
        setCommandProvider: (provider: unknown) => mockSetCommandProvider(provider),
        resetCommandProvider: () => mockResetCommandProvider(),
    },
    WorkerSceneCommandProvider: class WorkerSceneCommandProvider {},
}));

jest.mock('../src/global', () => ({
    GlobalPaths: {
        enginePath: '/engine',
    },
}));

import type { ISceneCommandProvider } from '../src/lib/scene/scene';
import {
    resetCommandProvider,
    setCommandProvider,
    WorkerSceneCommandProvider,
} from '../src/lib/scene/scene';

describe('Scene library command Provider entry', () => {
    beforeEach(() => {
        mockSetCommandProvider.mockReset();
        mockResetCommandProvider.mockReset();
    });

    it('forwards the typed Provider and returns its identity-bound registration', () => {
        const provider: ISceneCommandProvider = {
            request: jest.fn(),
        };
        const registration = { dispose: jest.fn() };
        mockSetCommandProvider.mockReturnValue(registration);

        expect(setCommandProvider(provider)).toBe(registration);
        expect(mockSetCommandProvider).toHaveBeenCalledWith(provider);
    });

    it('forwards reset to the core Rpc owner', () => {
        resetCommandProvider();

        expect(mockResetCommandProvider).toHaveBeenCalledTimes(1);
    });

    it('exports the standalone Worker Provider', () => {
        expect(typeof WorkerSceneCommandProvider).toBe('function');
    });
});
