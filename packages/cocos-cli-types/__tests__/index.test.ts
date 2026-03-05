import { Assets, Configuration } from '../index';
import type { BuildTemplateConfig } from '../builder';

describe('cocos-cli-types', () => {
    it('should be able to import types from index', () => {
        let typeInfo: Assets.IAssetType = 'cc.Texture2D';
        expect(typeInfo).toBeDefined();

        let assetInfo: Partial<Assets.IAssetInfo> = {
            name: 'test',
            uuid: 'test-uuid',
            type: typeInfo,
        };
        expect(assetInfo).toBeDefined();

        let assetOptions: Assets.CreateAssetOptions = {
            target: 'db://assets/test.png',
            uuid: 'test-uuid'
        };
        expect(assetOptions).toBeDefined();
    });

    it('should be able to import types from builder', () => {
        let templateConfig: Partial<BuildTemplateConfig> = {
            version: '1.0.0'
        };
        expect(templateConfig).toBeDefined();
    });
    
    it('should be able to import types from configuration', () => {
        let packageConfig: Configuration.IConfiguration = {
            test: 'value'
        };
        expect(packageConfig.test).toBe('value');
    });
});
