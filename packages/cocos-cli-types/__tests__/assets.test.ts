import type { AssetHandlerType, AssetDBOptions, IAssetInfo, IAssetType } from '../assets';

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
});
