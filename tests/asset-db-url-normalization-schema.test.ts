jest.mock('../src/core/scene', () => ({
    SCENE_TEMPLATE_TYPE: ['default'],
    NodeType: {
        Sprite: 'sprite',
    },
}));

jest.mock('../src/core/scene/common/editor/type', () => ({
    ReloadResult: {
        SUCCESS: 'success',
        FAILED: 'failed',
    },
}));

import { SchemaAssetDbUrl, SchemaAssetDbUrlOrUUID } from '../src/api/base/schema-asset-db-url';
import { SchemaCreateOptions, SchemaOpenOptions } from '../src/api/scene/schema';
import { SchemaNodeCreateByAsset, SchemaNodeQuery, SchemaNodeUpdate } from '../src/api/scene/node-schema';
import { SchemaCreatePrefabFromNodeOptions } from '../src/api/scene/prefab-schema';
import { SchemaInsertTextAtLineInfo } from '../src/api/system/file-editor-schema';

describe('AssetDB URL normalization schemas', () => {
    const previousAssetDBManager = (globalThis as any).assetDBManager;

    beforeEach(() => {
        (globalThis as any).assetDBManager = {
            assetDBInfo: {
                assets: {
                    name: 'assets',
                    target: 'E:\\pink\\testqwen3.72\\assets',
                },
            },
        };
    });

    afterAll(() => {
        (globalThis as any).assetDBManager = previousAssetDBManager;
    });

    it('normalizes relative AssetDB paths before strict db URL validation', () => {
        expect(SchemaAssetDbUrl.parse('assets/scripts/GameBoard.ts')).toBe('db://assets/scripts/GameBoard.ts');
        expect(SchemaAssetDbUrl.parse('assets\\scripts\\GameBoard.ts')).toBe('db://assets/scripts/GameBoard.ts');
    });

    it('normalizes absolute paths inside an AssetDB root', () => {
        expect(SchemaAssetDbUrl.parse('e:/pink/testqwen3.72/assets/scripts/GameBoard.ts')).toBe('db://assets/scripts/GameBoard.ts');
    });

    it('keeps valid db URLs and rejects non-AssetDB paths', () => {
        expect(SchemaAssetDbUrl.parse('db://assets/scripts/GameBoard.ts')).toBe('db://assets/scripts/GameBoard.ts');
        expect(SchemaAssetDbUrl.safeParse('Canvas/GameBoard').success).toBe(false);
        expect(SchemaAssetDbUrl.safeParse('C:\\outside\\GameBoard.ts').success).toBe(false);
    });

    it('normalizes file editor dbURL fields', () => {
        const parsed = SchemaInsertTextAtLineInfo.parse({
            dbURL: 'assets/scripts/GameBoard.ts',
            fileType: 'ts',
            lineNumber: 44,
            text: 'const value = 1;',
        });

        expect(parsed.dbURL).toBe('db://assets/scripts/GameBoard.ts');
    });

    it('normalizes scene and prefab AssetDB fields without changing node paths', () => {
        expect(SchemaCreateOptions.parse({
            baseName: 'Game',
            dbURL: 'assets/scenes',
        }).dbURL).toBe('db://assets/scenes');

        expect(SchemaOpenOptions.parse({
            dbURLOrUUID: 'assets/scenes/Game.scene',
        }).dbURLOrUUID).toBe('db://assets/scenes/Game.scene');

        expect(SchemaNodeCreateByAsset.parse({
            path: 'assets/scripts',
            dbURL: 'assets/prefabs/Enemy.prefab',
        }).dbURL).toBe('db://assets/prefabs/Enemy.prefab');

        expect(SchemaCreatePrefabFromNodeOptions.parse({
            nodePath: 'assets/scripts',
            dbURL: 'assets/prefabs/Enemy.prefab',
        }).dbURL).toBe('db://assets/prefabs/Enemy.prefab');

        expect(SchemaNodeQuery.parse({
            path: 'assets/scripts',
        }).path).toBe('assets/scripts');
    });

    it('keeps UUID support for mixed URL-or-UUID fields', () => {
        expect(SchemaAssetDbUrlOrUUID.parse('123456781234123412341234567890ab')).toBe('12345678-1234-1234-1234-1234567890ab');
    });

    it.each(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])(
        'rejects node names containing %p before create or update reaches the scene process',
        (character) => {
            const name = `A${character}B`;
            expect(SchemaNodeCreateByAsset.safeParse({
                path: '/',
                name,
                dbURL: 'db://assets/prefabs/Enemy.prefab',
            }).success).toBe(false);
            expect(SchemaNodeUpdate.safeParse({
                path: 'Enemy',
                name,
            }).success).toBe(false);
        },
    );
});
