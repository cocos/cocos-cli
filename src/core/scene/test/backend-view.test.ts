const mockRegister = jest.fn();
const mockLookup = jest.fn();
const mockRequest = jest.fn();
jest.mock('../scene-process/service/core/base-service', () => ({ BaseService: class {} }));
jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => (type: any) => mockRegister(type), queryRegisteredService: (...args: any[]) => mockLookup(...args),
    Service: { Editor: { getEditorSession: () => ({ uuid: 'scene-a' }) } },
}));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: () => ({ request: mockRequest }) } }));
jest.mock('cc', () => {
    class Camera { isValid = true; camera = { update: jest.fn() }; }
    class Node {
        isValid = true; scene = 'scene'; objFlags = 0;
        addComponent() { return Object.assign(new Camera(), { node: this }); }
        setWorldPosition = jest.fn(); setWorldRotation = jest.fn(); lookAt = jest.fn(); destroy = jest.fn();
    }
    return { Camera, Node, CCObject: { Flags: { DontSave: 1, HideInHierarchy: 2 } }, director: { getScene: () => 'scene' },
        Vec3: class { static ZERO: object = {}; constructor(public x: number, public y: number, public z: number) {} },
        Quat: class { constructor(public x: number, public y: number, public z: number, public w: number) {} } };
});
import '../scene-process/service/core/backend-view';

beforeEach(() => { mockLookup.mockReset(); mockRequest.mockReset(); });
it('uses the actual interactive camera in a Webview without querying another camera state', async () => {
    const camera = {};
    mockLookup.mockReturnValue({ getCamera: () => camera });
    const context = new (mockRegister.mock.calls[0][0])();
    expect(await context.getCamera()).toBe(camera);
    expect(mockRequest).not.toHaveBeenCalled();
});
it('uses saved scene camera data in the Worker and marks its measurement camera non-rendering', async () => {
    mockRequest.mockImplementation(async (_module, _method, args) => args[0] === 'camera' ? { fov: 60, near: 0.2, far: 100 } : {
        'scene-a': { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    const context = new (mockRegister.mock.calls[0][0])();
    const camera = await context.getCamera();
    expect(camera).toMatchObject({ fov: 60, near: 0.2, far: 100, visibility: 0 });
    expect(camera.node.setWorldPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 1, y: 2, z: 3 }));
    expect(mockLookup).not.toHaveBeenCalledWith('Gizmo');
});
