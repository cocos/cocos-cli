import { build, buildBundleOnly, make, run, queryBuildConfig } from '../builder';
import type { IBuildTaskOption, IBuildResultData } from '../builder';

describe('cocos-cli-types: builder', () => {
    it('should be able to import build task api functions', () => {
        const _build: typeof build = build;
        const _buildBundleOnly: typeof buildBundleOnly = buildBundleOnly;
        const _make: typeof make = make;
        const _run: typeof run = run;
        const _queryBuildConfig: typeof queryBuildConfig = queryBuildConfig;
        
        expect(1).toBe(1); // placeholder for successful type check
    });

    it('should be able to import IBuildTaskOption', () => {
        let options: Partial<IBuildTaskOption> = {
            buildPath: 'build',
        };
        expect(options.buildPath).toBe('build');
    });
    
    it('should be able to import IBuildResultData', () => {
        // IBuildResultData is a branded string or a complex type depending on compilation output.
        // We will just verify it can be declared as a type.
        let result: IBuildResultData | undefined = undefined;
        expect(result).toBeUndefined();
    });
});
