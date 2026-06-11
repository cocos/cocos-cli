import path from 'path';

const TJS = require('typescript-json-schema') as typeof import('typescript-json-schema');

describe('cocos config schema', () => {
    function resolveDefinition(schema: any, ref: string): any {
        return schema.definitions[ref.replace('#/definitions/', '')];
    }

    function generateSchema(): any {
        const input = path.resolve(__dirname, '../@types/cocos.config.d.ts');
        const tsconfig = path.resolve(__dirname, '../../../..', 'tsconfig.json');
        const program = TJS.programFromConfig(tsconfig, [input]);
        return TJS.generateSchema(program, 'COCOS_CONFIG', {
            noExtraProps: true,
            skipLibCheck: true,
        }, [input]);
    }

    it('allows manager-owned top-level fields', () => {
        const schema = generateSchema();

        expect(schema?.properties?.$schema).toBeDefined();
        expect(schema?.properties?.scene).toBeDefined();
    });

    it('describes bundle config custom entries with the custom bundle config shape', () => {
        const schema = generateSchema();
        const bundleConfigRef = schema.definitions.BuildConfiguration.properties.bundleConfig.$ref;
        const bundleConfig = resolveDefinition(schema, bundleConfigRef);
        const customRef = bundleConfig.properties.custom.$ref;
        const custom = resolveDefinition(schema, customRef);
        const customItem = resolveDefinition(schema, custom.additionalProperties.$ref);

        expect(customItem.properties.configs).toBeDefined();
    });

    it('allows platform-specific bundle override keys', () => {
        const schema = generateSchema();
        const overwriteSettingsRef = schema.definitions.CustomBundleConfigItem
            .properties.overwriteSettings.$ref;
        const overwriteSettings = resolveDefinition(schema, overwriteSettingsRef);

        expect(overwriteSettings.additionalProperties?.$ref).toBe('#/definitions/BundleConfigItem');
    });
});
