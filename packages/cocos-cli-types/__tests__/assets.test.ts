import type { AssetHandlerType, AssetDBOptions, IAssetInfo, IAssetType, IProperty, SerializedAssetQueryResult } from '../assets';

describe('cocos-cli-types: assets', () => {
    it('should be able to import AssetHandlerType', () => {
        let type: AssetHandlerType = 'database';
        expect(type).toBe('database');
    });

    it('should be able to import AssetDBOptions', () => {
        let options: Partial<AssetDBOptions> = {
            name: 'test-db',
            target: 'path/to/target',
            level: 3
        };
        expect(options.name).toBe('test-db');
    });
    
    it('should be able to import IAssetInfo', () => {
        let info: Partial<IAssetInfo> = {
            name: 'test-asset',
            uuid: 'test-uuid',
        };
        expect(info.name).toBe('test-asset');
    });
    
    it('should be able to import IAssetType', () => {
        let type: IAssetType = 'cc.Texture2D';
        expect(type).toBe('cc.Texture2D');
    });

    it('should be able to import serialized data types and namespace', () => {
        const property: IProperty = {
            name: 'friction',
            path: 'friction',
            type: 'Float',
            value: 0.5,
        };
        const result: SerializedAssetQueryResult = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: { friction: property },
        };

        const query: typeof import('../assets').serializedData.query = async () => result;
        const save: typeof import('../assets').serializedData.save = async () => result;

        expect(result.dump).toEqual({ friction: property });
        expect(query).toEqual(expect.any(Function));
        expect(save).toEqual(expect.any(Function));
    });
});
