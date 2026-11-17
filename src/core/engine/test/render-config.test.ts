import { join } from 'path';
import i18n from '../../base/i18n';
import { TestGlobalEnv } from '../../../tests/global-env';

describe('engine render-config localization', () => {
    afterEach(() => i18n.setLanguage('en'));

    it.each(['en', 'zh'] as const)('translates the selected engine render-config into %s', lang => {
        const metadata = jest.requireActual('../dynamic-metadata') as any;
        const localization = require(join(TestGlobalEnv.engineRoot, 'editor/i18n', lang, 'localization.js'));
        const source = require(join(TestGlobalEnv.engineRoot, 'editor/engine-features/render-config.json'));
        i18n.setLanguage(lang);
        const localized = metadata.getLocalizedEngineRenderConfig(TestGlobalEnv.engineRoot);
        let verified = 0;
        const visit = (original: any, actual: any): void => {
            if (original && typeof original === 'object') {
                expect(Object.keys(actual)).toEqual(Object.keys(original));
                for (const key of Object.keys(original)) visit(original[key], actual[key]);
            } else if (typeof original === 'string' && original.startsWith('i18n:ENGINE.')) {
                const expected = original.slice('i18n:ENGINE.'.length).split('.').reduce((node, key) => node?.[key], localization);
                if (typeof expected === 'string') {
                    expect(actual).toBe(expected);
                    expect(actual).not.toMatch(/^i18n:/);
                    verified++;
                } else {
                    // Some historical dictionaries omit keys already referenced by their source.
                    expect(typeof actual).toBe('string');
                }
            } else {
                expect(actual).toEqual(original);
            }
        };
        visit(source, localized);
        expect(verified).toBeGreaterThan(10);
    });
});
