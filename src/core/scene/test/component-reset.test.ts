import type { CompManager } from '../scene-process/service/component/index';

const mockDestroy = jest.fn();
const mockAddComponent = jest.fn();
const mockDumpComponent = jest.fn();
const mockRestoreSnapshot = jest.fn();
const mockRestoreProperty = jest.fn();

jest.mock('cc', () => ({
    Component: class Component {},
    MissingScript: class MissingScript {},
    Node: class Node {
        addComponent = mockAddComponent;
        destroy = mockDestroy;
    },
}));
jest.mock('../scene-process/service/component/utils', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        dumpComponent: mockDumpComponent,
        restoreComponentSnapshotProperties: mockRestoreSnapshot,
        restoreProperty: mockRestoreProperty,
    },
}));
jest.mock('../scene-process/service/dump/service-access', () => ({ registerDumpComponentAccess: jest.fn() }));
jest.mock('../scene-process/service/core/global-events', () => ({ ServiceEvents: {} }));
jest.mock('../scene-process/service/core/decorator', () => ({ queryRegisteredService: jest.fn() }));

describe('component Reset restoration', () => {
    let manager: CompManager;
    const previousCC = (globalThis as any).cc;
    const previousEditor = (globalThis as any).EditorExtends;
    const before = { value: { uuid: { value: 'original' }, capacity: { value: 37 }, enabled: { value: false } } };
    const defaults = { value: {
        uuid: { value: 'temporary' }, node: { value: 'temporary-node' }, name: { value: '' },
        enabled: { value: true }, _objFlags: { value: 0 }, capacity: { value: 100 },
        renderer: { value: { useGPU: { value: false } } },
    } };
    const component = { resetInEditor: jest.fn(), onRestore: jest.fn() };

    beforeAll(async () => {
        (globalThis as any).cc = require('cc');
        (globalThis as any).EditorExtends = { Component: {} };
        const { CompManager } = await import('../scene-process/service/component/index');
        manager = new CompManager();
    });
    afterAll(() => {
        (globalThis as any).cc = previousCC;
        (globalThis as any).EditorExtends = previousEditor;
    });
    beforeEach(() => {
        jest.resetAllMocks();
        mockAddComponent.mockReturnValue({});
        mockDumpComponent.mockReturnValueOnce(before).mockReturnValueOnce(defaults);
        mockRestoreSnapshot.mockResolvedValue(undefined);
    });

    it('uses the shared restoration entry and preserves Reset identity/enabled restrictions', async () => {
        expect(await manager.resetComponent(component)).toBe(true);
        expect(mockRestoreSnapshot).toHaveBeenCalledWith(component, { value: {
            capacity: { value: 100 }, renderer: defaults.value.renderer,
        } });
        expect(mockRestoreProperty).not.toHaveBeenCalled();
        expect(component.resetInEditor).toHaveBeenCalledTimes(1);
        expect(component.onRestore).toHaveBeenCalledTimes(1);
        expect(defaults.value.uuid.value).toBe('temporary');
        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('restores the previous snapshot after a partial Reset failure and disposes the temporary node', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            mockRestoreSnapshot.mockRejectedValueOnce(new Error('material restoration failed'));
            expect(await manager.resetComponent(component)).toBe(false);
            expect(mockRestoreSnapshot).toHaveBeenNthCalledWith(2, component, before);
            expect(component.resetInEditor).not.toHaveBeenCalled();
            expect(component.onRestore).toHaveBeenCalledTimes(1);
            expect(mockDestroy).toHaveBeenCalledTimes(1);
        } finally {
            error.mockRestore();
        }
    });

    it('also rolls back a failing resetInEditor hook', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            component.resetInEditor.mockImplementationOnce(() => { throw new Error('hook failed'); });
            expect(await manager.resetComponent(component)).toBe(false);
            expect(mockRestoreSnapshot).toHaveBeenNthCalledWith(2, component, before);
            expect(mockDestroy).toHaveBeenCalledTimes(1);
        } finally {
            error.mockRestore();
        }
    });
});
