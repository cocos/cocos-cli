import { createPinKPlatformConfig } from '../share/pink-platform-config';
import type { IPlatformBuildPluginConfig } from '../@types/protected';

// The packaging adapter must not turn a UI visibility decision into a build-option deletion.
describe('PinK builtin platform packaging', () => {
    it('retains execution-only fields and defaults while exposing the display schema', () => {
        const config = {
            displayName: 'Test', platformType: 'HTML5', hooks: './old-hooks',
            options: {
                visible: { type: 'string', default: 'kept' },
                hiddenValue: { type: 'boolean', hidden: true, default: true },
            },
        } as IPlatformBuildPluginConfig;
        const result = createPinKPlatformConfig(config, 'web-mobile');
        expect(result.schema.properties?.hiddenValue).toBeUndefined();
        expect(result.options?.hiddenValue.default).toBe(true);
        expect(result.schema.properties?.visible.default).toBe('kept');
        expect(result).not.toHaveProperty('hooks');
        expect(config.hooks).toBe('./old-hooks');
    });

    it('preserves nested validation metadata and rule functions', () => {
        const func = (value: unknown) => value === 'valid';
        const config = {
            displayName: 'Test', platformType: 'HTML5', verifyRuleMap: { custom: { func, message: 'invalid' } },
            options: { nested: { type: 'object', properties: {
                value: { type: 'string', verifyRules: ['custom'], verifyLevel: 'warn' },
            } } },
        } as unknown as IPlatformBuildPluginConfig;
        const result = createPinKPlatformConfig(config, 'web-mobile');
        expect(result.schema.properties?.nested.properties?.value).toMatchObject({ verifyRules: ['custom'], verifyLevel: 'warn' });
        expect(result.verifyRuleMap?.custom.func).toBe(func);
    });
});
