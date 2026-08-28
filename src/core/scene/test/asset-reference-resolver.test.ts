import {
    AssetReferenceValidationError,
    getExpectedAssetType,
    IAssetReferenceInfo,
    resolveAssetReference,
} from '../main-process/proxy/asset-reference-resolver';

const SPRITE_UUID = '11111111-1111-4111-8111-111111111111@f9941';
const TEXTURE_UUID = '11111111-1111-4111-8111-111111111111@6c48a';
const PARENT_UUID = '11111111-1111-4111-8111-111111111111';

function spriteFrame(uuid = SPRITE_UUID): IAssetReferenceInfo {
    return {
        uuid,
        name: 'spriteFrame',
        url: `db://assets/coin.png/${uuid.split('@')[1]}`,
        type: 'cc.SpriteFrame',
        extends: ['cc.Asset'],
    };
}

function imageAsset(subAssets: Record<string, IAssetReferenceInfo> = {}): IAssetReferenceInfo {
    return {
        uuid: PARENT_UUID,
        name: 'coin.png',
        url: 'db://assets/coin.png',
        type: 'cc.ImageAsset',
        extends: ['cc.Asset'],
        subAssets,
    };
}

describe('asset reference resolver', () => {
    it('detects Asset types for scalar and array property dumps', () => {
        expect(getExpectedAssetType({ type: 'cc.SpriteFrame', extends: ['cc.Asset'] })).toBe('cc.SpriteFrame');
        expect(getExpectedAssetType({
            type: 'Array',
            isArray: true,
            elementTypeData: { type: 'cc.AnimationClip', extends: ['cc.Asset'] },
        })).toBe('cc.AnimationClip');
        expect(getExpectedAssetType({ type: 'cc.Color', extends: ['cc.ValueType'] })).toBeNull();
    });

    it('passes through an already compatible exact UUID', async () => {
        const value = { uuid: SPRITE_UUID };
        const query = jest.fn().mockResolvedValue(spriteFrame());

        await expect(resolveAssetReference(value, 'cc.SpriteFrame', 'spriteFrame', query)).resolves.toBe(value);
    });

    it('normalizes a db URL to the resolved exact UUID', async () => {
        const value = { uuid: 'db://assets/coin.png/spriteFrame' };
        const query = jest.fn().mockResolvedValue(spriteFrame());

        await expect(resolveAssetReference(value, 'cc.SpriteFrame', 'spriteFrame', query)).resolves.toEqual({
            uuid: SPRITE_UUID,
        });
    });

    it('normalizes an incompatible parent to its only compatible sub-asset', async () => {
        const query = jest.fn().mockResolvedValue(imageAsset({
            texture: {
                uuid: TEXTURE_UUID,
                type: 'cc.Texture2D',
                extends: ['cc.Asset'],
            },
            spriteFrame: spriteFrame(),
        }));

        await expect(resolveAssetReference(
            { uuid: PARENT_UUID, tag: 'preserved' },
            'cc.SpriteFrame',
            'spriteFrame',
            query,
        )).resolves.toEqual({ uuid: SPRITE_UUID, tag: 'preserved' });
    });

    it('accepts a subclass when the property expects cc.Asset', async () => {
        const query = jest.fn().mockResolvedValue(spriteFrame());

        await expect(resolveAssetReference(
            { uuid: SPRITE_UUID },
            'cc.Asset',
            'asset',
            query,
        )).resolves.toEqual({ uuid: SPRITE_UUID });
    });

    it('rejects a resolved asset when no compatible sub-asset exists', async () => {
        const query = jest.fn().mockResolvedValue(imageAsset({
            texture: {
                uuid: TEXTURE_UUID,
                type: 'cc.Texture2D',
                extends: ['cc.Asset'],
            },
        }));

        await expect(resolveAssetReference(
            { uuid: PARENT_UUID },
            'cc.AnimationClip',
            'clips',
            query,
        )).rejects.toThrow(AssetReferenceValidationError);
        await expect(resolveAssetReference(
            { uuid: PARENT_UUID },
            'cc.AnimationClip',
            'clips',
            query,
        )).rejects.toThrow('expected cc.AnimationClip');
    });

    it('rejects ambiguous compatible sub-assets and reports every candidate', async () => {
        const secondUuid = '11111111-1111-4111-8111-111111111111@aaaaa';
        const query = jest.fn().mockResolvedValue(imageAsset({
            first: spriteFrame(),
            second: spriteFrame(secondUuid),
        }));

        await expect(resolveAssetReference(
            { uuid: PARENT_UUID },
            'cc.SpriteFrame',
            'spriteFrame',
            query,
        )).rejects.toThrow(secondUuid);
    });

    it('preserves unresolved historical UUIDs for the existing placeholder path', async () => {
        const value = { uuid: '22222222-2222-4222-8222-222222222222' };
        const query = jest.fn().mockResolvedValue(null);

        await expect(resolveAssetReference(value, 'cc.SpriteFrame', 'spriteFrame', query)).resolves.toBe(value);
    });

    it('requires the new db URL convenience syntax to resolve', async () => {
        const query = jest.fn().mockResolvedValue(null);

        await expect(resolveAssetReference(
            { uuid: 'db://assets/missing.png' },
            'cc.SpriteFrame',
            'spriteFrame',
            query,
        )).rejects.toThrow('cannot be resolved');
    });

    it.each([
        null,
        { uuid: '' },
        { uuid: 'ui-sprite-material' },
    ])('does not query or change legacy empty/internal value %#', async (value) => {
        const query = jest.fn();

        await expect(resolveAssetReference(value, 'cc.SpriteFrame', 'spriteFrame', query)).resolves.toBe(value);
        expect(query).not.toHaveBeenCalled();
    });
});
