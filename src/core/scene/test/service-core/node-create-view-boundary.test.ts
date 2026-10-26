import { resetNodeCreateMocks } from './node-create-test-harness';
import { registerNodeCreateDragFactory, type INodeCreateDragController } from '../../scene-process/service/core/node-create-drag';

beforeEach(resetNodeCreateMocks);

it('keeps worker Node creation available without loading a drag view', async () => {
    const { NodeService } = require('../../scene-process/service/node');
    const service = new NodeService();
    const result = await service.beginCreateDrag({ sessionId: 'worker' });
    expect(result).toEqual({ ok: false, error: { code: 'NOT_EDITABLE', message: expect.stringContaining('interactive') } });
    expect(typeof service.createByAsset).toBe('function');
    expect(() => service.onEditorDisposed()).not.toThrow();
});

it('creates one registered drag controller lazily, forwards calls, and releases it on disposal', async () => {
    const controller: INodeCreateDragController = {
        begin: jest.fn(async () => ({ ok: true as const, value: { sessionId: 'view', state: 'previewing' as const } })),
        update: jest.fn(), commit: jest.fn(), cancel: jest.fn(), cancelActive: jest.fn(), dispose: jest.fn(),
    };
    const factory = jest.fn(() => controller);
    const unregister = registerNodeCreateDragFactory(factory);
    try {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        expect(factory).not.toHaveBeenCalled();
        const request = { sessionId: 'view' };
        await service.beginCreateDrag(request);
        await service.beginCreateDrag(request);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory).toHaveBeenCalledWith(expect.objectContaining({ resolveCanvasTransaction: expect.any(Function), recordCreateNodeCommand: expect.any(Function) }));
        expect(controller.begin).toHaveBeenCalledWith(request);
        service.onEditorDisposed();
        expect(controller.dispose).toHaveBeenCalledTimes(1);
    } finally { unregister(); }
    const { NodeService } = require('../../scene-process/service/node');
    expect((await new NodeService().beginCreateDrag({})).error.code).toBe('NOT_EDITABLE');
});
