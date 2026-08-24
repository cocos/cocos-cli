import { normalizeDtsRollupContent } from '../workflow/generate-dts-postprocess';

describe('normalizeDtsRollupContent', () => {
    it('normalizes unstable macOS builder rollup output from asset-db', () => {
        const macBuilderRollup = [
            "import EventEmitter from 'events';",
            "import { EventEmitter as EventEmitter_2 } from 'stream';",
            "import type { PluginItem } from '@babel/core';",
            "import { SpriteFrame } from 'cc';",
            '',
            'export declare interface Meta {',
            '    uuid: string;',
            '}',
            '',
            'export declare interface MetaInfo {',
            '    json: Meta;',
            '}',
            '',
            'export declare class VirtualAsset {',
            '    existsInLibrary(extOrFile: string): boolean;',
            '}',
            '',
            'export declare class Asset extends VirtualAsset {',
            '    updateUrl(): void;',
            '    save(): boolean;',
            '    isDirectory(): boolean;',
            '}',
            '',
            'export declare class MetaManager {',
            '    destroy(): void;',
            '    read(path: string): boolean | undefined;',
            '    write(path: any): false | undefined;',
            '    remove(path: string): void;',
            '    get(path: string): MetaInfo;',
            '    move(pathA: string, pathB: string): void;',
            '}',
            '',
            'export declare const tail = 1;',
            '',
        ].join('\n');

        const normalized = normalizeDtsRollupContent('builder.d.ts', macBuilderRollup);

        expect(normalized).toContain("import { IAssetDeleteOptions, IAssetWriteFileOptions } from '@cocos/asset-db';");
        expect(normalized).toContain('save(): Promise<boolean>;');
        expect(normalized).toContain('write(path: string, options?: IAssetWriteFileOptions): Promise<false | undefined>;');
        expect(normalized).toContain('remove(path: string, options?: IAssetDeleteOptions): Promise<void>;');
        expect(normalized).toContain('get(path: string): Promise<MetaInfo>;');
        expect(normalized).toContain('existsInLibrary(extOrFile: string): Promise<boolean>;');

        expect(normalized).not.toContain('save(): boolean;');
        expect(normalized).not.toContain('write(path: any): false | undefined;');
        expect(normalized).not.toContain('remove(path: string): void;');
        expect(normalized).not.toContain('get(path: string): MetaInfo;');
        expect(normalized).not.toContain('existsInLibrary(extOrFile: string): boolean;');
    });

    it('does not change non-builder rollup content', () => {
        const engineRollup = 'export declare function getRenderConfig(): Promise<void>;\n';

        expect(normalizeDtsRollupContent('engine.d.ts', engineRollup)).toBe(engineRollup);
    });
});
