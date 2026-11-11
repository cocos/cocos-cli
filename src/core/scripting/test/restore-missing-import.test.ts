import { pathToFileURL } from 'url';
import {
    addedFileSatisfiesMissingImport,
    parentsRestoredByAddedFile,
    readMissingModuleImport,
} from '../packer-driver/restore-missing-import';

const PARENT = pathToFileURL('/projects/cocos cli/assets/scripts/BejeweledGame.ts').href;
const ADAPTER = pathToFileURL('/projects/cocos cli/assets/scripts/EvaluationAdapter.ts').href;
const OTHER = pathToFileURL('/projects/cocos cli/assets/scripts/UiKit.ts').href;

describe('restore missing script import', () => {
    it('reads the unresolved specifier from the packer error', () => {
        const error = new Error(
            `(i18n needed)resolve_error_module_not_found: ${JSON.stringify({
                specifier: './EvaluationAdapter',
                parentURL: PARENT,
            })}`,
        );
        expect(readMissingModuleImport(error)).toEqual({
            specifier: './EvaluationAdapter',
            parentHref: PARENT,
        });
    });

    it('reads translated English and Chinese messages', () => {
        expect(readMissingModuleImport(new Error(`Module "./EvaluationAdapter" not found for ${PARENT}`))).toEqual({
            specifier: './EvaluationAdapter',
            parentHref: PARENT,
        });
        expect(readMissingModuleImport(new Error(`以 ${PARENT} 为起点找不到模块 "./EvaluationAdapter"`))).toEqual({
            specifier: './EvaluationAdapter',
            parentHref: PARENT,
        });
    });

    it('ignores errors that are not a missing module', () => {
        expect(readMissingModuleImport(new Error('Unexpected token'))).toBeNull();
    });

    it('matches an extensionless relative import to the .ts file that appears later', () => {
        expect(addedFileSatisfiesMissingImport(PARENT, './EvaluationAdapter', ADAPTER)).toBe(true);
        expect(addedFileSatisfiesMissingImport(PARENT, './EvaluationAdapter.ts', ADAPTER)).toBe(true);
        expect(addedFileSatisfiesMissingImport(PARENT, './EvaluationAdapter', OTHER)).toBe(false);
        expect(addedFileSatisfiesMissingImport(PARENT, 'cc', ADAPTER)).toBe(false);
    });

    it('puts the waiting importer back when its missing file is added', () => {
        const pending = new Map<string, Set<string>>([[PARENT, new Set(['./EvaluationAdapter'])]]);
        expect(parentsRestoredByAddedFile(pending, ADAPTER)).toEqual([PARENT]);
        expect(parentsRestoredByAddedFile(pending, OTHER)).toEqual([]);
    });
});
