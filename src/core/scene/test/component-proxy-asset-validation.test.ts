const mockQueryAssetInfo = jest.fn();
const mockRequest = jest.fn();

jest.mock('../../assets', () => ({
    assetManager: {
        queryAssetInfo: (...args: unknown[]) => mockQueryAssetInfo(...args),
    },
}));

jest.mock('../main-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
    },
}));

import { ComponentProxy } from '../main-process/proxy/component-proxy';

const PARENT_UUID = '11111111-1111-4111-8111-111111111111';
const SPRITE_UUID = `${PARENT_UUID}@f9941`;

const componentDump = {
    value: {
        uuid: { value: 'component-uuid' },
        label: { type: 'String', value: '', path: 'label' },
        spriteFrame: {
            type: 'cc.SpriteFrame',
            extends: ['cc.Asset'],
            value: { uuid: '' },
            path: 'spriteFrame',
        },
        clips: {
            type: 'Array',
            isArray: true,
            value: [],
            path: 'clips',
            elementTypeData: {
                type: 'cc.AnimationClip',
                extends: ['cc.Asset'],
                value: { uuid: '' },
                path: '',
            },
        },
    },
};

function setPropertyRequests() {
    return mockRequest.mock.calls.filter(([service, method]) => service === 'Component' && method === 'setProperty');
}

describe('ComponentProxy Asset validation', () => {
    beforeEach(() => {
        mockQueryAssetInfo.mockReset();
        mockRequest.mockReset();
        mockRequest.mockImplementation((service: string, method: string) => {
            if (service === 'Component' && method === 'query') {
                return componentDump;
            }
            if (service === 'Node' && method === 'queryNodeTree') {
                return { components: [{ value: 'component-uuid' }] };
            }
            if (service === 'Component' && method === 'setProperty') {
                return true;
            }
            throw new Error(`Unexpected RPC request: ${service}.${method}`);
        });
    });

    it('normalizes a parent UUID before sending the scene write RPC', async () => {
        mockQueryAssetInfo.mockReturnValue({
            uuid: PARENT_UUID,
            type: 'cc.ImageAsset',
            extends: ['cc.Asset'],
            subAssets: {
                spriteFrame: {
                    uuid: SPRITE_UUID,
                    type: 'cc.SpriteFrame',
                    extends: ['cc.Asset'],
                },
            },
        });

        await expect(ComponentProxy.setProperty({
            componentPath: 'Canvas/Coin/cc.Sprite',
            properties: { spriteFrame: { uuid: PARENT_UUID } },
        })).resolves.toBe(true);

        expect(mockQueryAssetInfo).toHaveBeenCalledWith(PARENT_UUID, ['subAssets', 'extends']);
        expect(setPropertyRequests()).toHaveLength(1);
        expect(setPropertyRequests()[0][2][0].dump.value).toEqual({ uuid: SPRITE_UUID });
    });

    it('validates every property before sending any write RPC', async () => {
        mockQueryAssetInfo.mockReturnValue({
            uuid: PARENT_UUID,
            type: 'cc.ImageAsset',
            extends: ['cc.Asset'],
            subAssets: {},
        });

        await expect(ComponentProxy.setProperty({
            componentPath: 'Canvas/Coin/cc.Sprite',
            properties: {
                label: 'would-have-been-written-first',
                spriteFrame: { uuid: PARENT_UUID },
            },
        })).rejects.toThrow('Invalid asset reference');

        expect(setPropertyRequests()).toHaveLength(0);
    });

    it('preserves unresolved UUIDs so the shared decoder can create placeholders', async () => {
        const missingUuid = '22222222-2222-4222-8222-222222222222';
        mockQueryAssetInfo.mockReturnValue(null);

        await ComponentProxy.setProperty({
            componentPath: 'Canvas/Coin/cc.Sprite',
            properties: { spriteFrame: { uuid: missingUuid } },
        });

        expect(setPropertyRequests()).toHaveLength(1);
        expect(setPropertyRequests()[0][2][0].dump.value).toEqual({ uuid: missingUuid });
    });

    it('validates Asset arrays transactionally', async () => {
        mockQueryAssetInfo.mockImplementation((uuid: string) => uuid === 'valid-clip'
            ? { uuid, type: 'cc.AnimationClip', extends: ['cc.Asset'] }
            : { uuid, type: 'cc.ImageAsset', extends: ['cc.Asset'], subAssets: {} });

        await expect(ComponentProxy.setProperty({
            componentPath: 'Canvas/Coin/cc.Sprite',
            properties: {
                clips: [{ uuid: 'valid-clip' }, { uuid: 'wrong-clip' }],
            },
        })).rejects.toThrow('expected cc.AnimationClip');

        expect(setPropertyRequests()).toHaveLength(0);
    });

    it('forwards PolygonCollider2D regeneration to the scene process', async () => {
        const expected = {
            path: '/Canvas/Polygon/cc.PolygonCollider2D',
            changed: true,
            pointCount: 8,
            source: 'sprite-alpha',
        };
        mockRequest.mockResolvedValue(expected);

        await expect(ComponentProxy.regeneratePolygon2DPoints({
            path: '/Canvas/Polygon/cc.PolygonCollider2D',
            record: false,
        })).resolves.toEqual(expected);

        expect(mockRequest).toHaveBeenCalledWith('Component', 'regeneratePolygon2DPoints', [{
            path: '/Canvas/Polygon/cc.PolygonCollider2D',
            record: false,
        }]);
    });
});
