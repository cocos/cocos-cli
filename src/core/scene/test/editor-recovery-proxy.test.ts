const mockRequest = jest.fn();
jest.mock('../main-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRequest }) },
}));
jest.mock('../index', () => jest.requireActual('../common'));

import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SchemaDiscardOptions, SchemaReloadFromDiskOptions } from '../../../api/scene/schema';

beforeEach(() => mockRequest.mockReset());

describe('Explicit scene recovery public contract', () => {
    it.each([SchemaDiscardOptions, SchemaReloadFromDiskOptions])('requires literal true consent in the MCP schema', schema => {
        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ discardChanges: false }).success).toBe(false);
        expect(schema.safeParse({ discardChanges: 'true' }).success).toBe(false);
        expect(schema.safeParse({ discardChanges: true }).success).toBe(true);
    });

    it('forwards explicit discard without calling save or close', async () => {
        mockRequest.mockResolvedValue(true);
        await expect(EditorProxy.discard({ discardChanges: true })).resolves.toBe(true);
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('Editor', 'discard', [{ discardChanges: true }]);
    });

    it('converts the fresh scene dump returned by reloadFromDisk', async () => {
        mockRequest.mockResolvedValue({
            isScene: true,
            name: { value: 'Disk scene' },
            __identifier__: { assetUuid: 'scene-id', assetType: 'scene', assetUrl: 'db://assets/Disk.scene' },
        });
        const options = { discardChanges: true as const, includeChildren: false };
        const result = await EditorProxy.reloadFromDisk(options);
        expect(result).toMatchObject({ name: 'Disk scene', assetUuid: 'scene-id' });
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('Editor', 'reloadFromDisk', [options]);
    });
});
