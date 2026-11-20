jest.mock('../../engine', () => ({ Engine: {
    queryModuleConfig: jest.fn(), getModules: jest.fn(() => ['base']),
} }));
jest.mock('../index', () => ({
    getPlatformBuildSchema: jest.fn(() => ({ common: {}, platformOptions: {} })),
    queryDefaultBuildConfigByPlatform: jest.fn(), checkBuildOptions: jest.fn(),
}));
import { Engine } from '../../engine';
import { checkBuildOptions, getPlatformBuildSchema, queryDefaultBuildConfigByPlatform } from '../index';
import { queryEngineModules, validateBuildConfig } from '../configuration';

describe('build configuration discovery and validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Engine.queryModuleConfig as jest.Mock).mockReturnValue({
            features: { base: { label: 'Base' }, ui: { label: 'UI' }, physics: { options: {} } },
            moduleDependMap: { ui: ['base'] }, envLimitModule: {},
        });
        (getPlatformBuildSchema as jest.Mock).mockReturnValue({ common: {}, platformOptions: {} });
        (queryDefaultBuildConfigByPlatform as jest.Mock).mockResolvedValue({
            debug: true, packages: { demo: { appid: 'default', orientation: 'portrait' } },
        });
        (checkBuildOptions as jest.Mock).mockResolvedValue({});
    });
    it('returns real feature identifiers and dependencies, excluding display groups', () => {
        const result = queryEngineModules();
        expect(result.modules.map((item: { id: string }) => item.id)).toEqual(['base', 'ui']);
        expect(result.modules[1].dependencies).toEqual(['base']);
        result.modules[1].dependencies.push('other');
        expect(queryEngineModules().modules[1].dependencies).toEqual(['base']);
    });
    it('merges platform defaults without mutating caller options', async () => {
        const options = { debug: false, packages: { demo: { appid: 'custom' } } };
        (checkBuildOptions as jest.Mock).mockImplementation(async (_platform, candidate) => {
            expect(candidate).toMatchObject({ debug: false, packages: { demo: { appid: 'custom', orientation: 'portrait' } } });
            candidate.packages.demo.appid = 'changed';
            return {};
        });
        expect((await validateBuildConfig('demo', options)).valid).toBe(true);
        expect(options.packages.demo.appid).toBe('custom');
    });
    it('rejects unknown modules before invoking platform validators', async () => {
        const result = await validateBuildConfig('demo', { includeModules: ['base', 'missing'] });
        expect(result.errors).toEqual([expect.objectContaining({ code: 'UNKNOWN_ENGINE_MODULE', path: 'includeModules[1]' })]);
        expect(checkBuildOptions).not.toHaveBeenCalled();
    });
    it('rejects malformed module arrays and mismatched platforms', async () => {
        const result = await validateBuildConfig('demo', { platform: 'other', includeModules: 'ui' });
        expect(result.errors.map(error => error.code)).toEqual(['PLATFORM_MISMATCH', 'INVALID_ENGINE_MODULES']);
    });
    it('preserves validation warnings without treating them as errors', async () => {
        (checkBuildOptions as jest.Mock).mockResolvedValue({ debug: { valid: false, level: 'warn', message: 'Warning' } });
        const result = await validateBuildConfig('demo', {});
        expect(result.valid).toBe(true);
        expect(result.warnings[0]).toMatchObject({ path: 'debug', message: 'Warning' });
    });
    it('returns field errors and suggested fixes from existing builder rules', async () => {
        (checkBuildOptions as jest.Mock).mockResolvedValue({ debug: { valid: false, message: 'Expected boolean', fixedValue: false } });
        const result = await validateBuildConfig('demo', {});
        expect(result.valid).toBe(false);
        expect(result.checks.debug.fixedValue).toBe(false);
    });
    it('fails for unregistered platforms before loading defaults', async () => {
        (getPlatformBuildSchema as jest.Mock).mockImplementation(() => { throw new Error('Unknown platform'); });
        await expect(validateBuildConfig('unknown', {})).rejects.toThrow('Unknown platform');
        expect(queryDefaultBuildConfigByPlatform).not.toHaveBeenCalled();
    });
});
