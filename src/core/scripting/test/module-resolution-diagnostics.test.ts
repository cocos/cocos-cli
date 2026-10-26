import { pathToFileURL } from 'url';
import { attachModuleResolutionDiagnostics } from '../packer-driver/module-resolution-diagnostics';
import { ModLo } from '@cocos/creator-programming-mod-lo/lib/mod-lo';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('source module resolution diagnostics', () => {
    test('real ModLo reports a missing TS dependency and resolves it after creation', () => {
        // ModLo canonicalizes asset prefixes. macOS /var temp paths resolve under /private/var.
        // Use the same canonical path for the importer and the asset prefix.
        const temporaryRoot = fs.realpathSync(os.tmpdir());
        const directory = fs.realpathSync(fs.mkdtempSync(path.join(temporaryRoot, 'cli-resolution-diagnostic-')));
        try {
            const source = path.join(directory, 'Importer.ts');
            fs.writeFileSync(source, "import './Value';");
            const resolver = new ModLo({ _compressUUID: uuid => uuid });
            resolver.setAssetPrefixes([pathToFileURL(directory + path.sep).href]);
            const report = jest.fn();
            attachModuleResolutionDiagnostics(resolver, 'preview', report);
            expect(() => resolver.resolve('./Value', pathToFileURL(source), 'esm')).toThrow();
            expect(report.mock.calls[0][0]).toContain(source);
            fs.writeFileSync(path.join(directory, 'Value.ts'), 'export const value = 1;');
            const resolved = resolver.resolve('./Value', pathToFileURL(source), 'esm');
            expect(resolved.isExternal).toBe(false);
            expect(report).toHaveBeenCalledTimes(1);
        } finally {
            expect(path.resolve(directory).startsWith(temporaryRoot + path.sep)).toBe(true);
            expect(path.basename(directory).startsWith('cli-resolution-diagnostic-')).toBe(true);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
    test('reports original source, import and target while preserving error identity', () => {
        const error = new Error('dependency not found');
        const resolver = { resolve: jest.fn(() => { throw error; }) } as unknown as Pick<ModLo, 'resolve'>;
        const report = jest.fn();
        attachModuleResolutionDiagnostics(resolver, 'preview', report);
        const source = pathToFileURL('/demo/assets/My Script.ts');
        expect(() => resolver.resolve('./Missing', source, 'esm')).toThrow(error);
        expect(report).toHaveBeenCalledTimes(1);
        const text = report.mock.calls[0][0];
        expect(text).toContain('target="preview"');
        expect(text).toContain('My Script.ts');
        expect(text).toContain('Import: "./Missing"');
        expect(text).toContain('dependency not found');
        expect((resolver.resolve as jest.Mock).mock).toBeUndefined();
    });

    test('coalesces repeated failures, reports again after recovery, preserves binding and arguments', () => {
        const report = jest.fn();
        let failed = true;
        const result = { isExternal: true as const, specifierOrURL: 'cc' };
        const resolver = { resolve: function (...args: Parameters<ModLo['resolve']>) {
            expect(this).toBe(resolver);
            expect(args[0]).toBe('./Value');
            if (failed) throw new Error('not ready');
            return result;
        } } as Pick<ModLo, 'resolve'>;
        attachModuleResolutionDiagnostics(resolver, 'editor', report);
        for (let i = 0; i < 3; i++) expect(() => resolver.resolve('./Value')).toThrow('not ready');
        expect(report).toHaveBeenCalledTimes(1);
        failed = false;
        expect(resolver.resolve('./Value')).toBe(result);
        failed = true;
        expect(() => resolver.resolve('./Value')).toThrow('not ready');
        expect(report).toHaveBeenCalledTimes(2);
    });

    test('keeps db URLs and entry errors readable and does not mask errors if logging fails', () => {
        const error = new Error('original failure');
        const resolver = { resolve() { throw error; } } as Pick<ModLo, 'resolve'>;
        const report = jest.fn();
        attachModuleResolutionDiagnostics(resolver, 'preview', report);
        expect(() => resolver.resolve('./Missing', new URL('db://assets/Test.ts'))).toThrow(error);
        expect(report.mock.calls[0][0]).toContain('db://assets/Test.ts');
        expect(() => resolver.resolve('./Entry')).toThrow(error);
        expect(report.mock.calls[1][0]).toContain('<entry module>');
        const other = { resolve() { throw error; } } as Pick<ModLo, 'resolve'>;
        attachModuleResolutionDiagnostics(other, 'preview', () => { throw new Error('logger failed'); });
        expect(() => other.resolve('missing')).toThrow(error);
    });
});
