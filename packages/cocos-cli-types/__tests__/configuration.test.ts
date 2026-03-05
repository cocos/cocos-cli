import { init, migrateFromProject, reload } from '../configuration';
import type { IConfiguration } from '../configuration';

describe('cocos-cli-types: configuration', () => {
    it('should be able to import api functions', () => {
        const _init: typeof init = init;
        const _migrateFromProject: typeof migrateFromProject = migrateFromProject;
        const _reload: typeof reload = reload;

        expect(1).toBe(1);
    });

    it('should be able to import IConfiguration', () => {
        let options: Partial<IConfiguration> = {
            name: 'test-config'
        };
        expect(options.name).toBe('test-config');
    });
});
