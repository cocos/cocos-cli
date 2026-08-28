jest.mock('../asset-handler/assets/gltf/material', () => ({
    dumpMaterial: jest.fn(),
}));
jest.mock('../asset-handler/assets/gltf/reader-manager', () => ({
    glTfReaderManager: {
        delete: jest.fn(),
        getOrCreate: jest.fn(),
    },
}));
jest.mock('../asset-handler/assets/gltf/meshSimplify', () => ({
    getDefaultSimplifyOptions: () => ({
        targetRatio: 1,
        enableSmartLink: true,
        agressiveness: 7,
        maxIterationCount: 100,
    }),
}));
jest.mock('../asset-handler/assets/utils/gltf-converter', () => ({
    GltfConverter: jest.fn(),
    GltfSubAsset: jest.fn(),
}));
jest.mock('../manager/query', () => ({
    __esModule: true,
    default: {},
}));
jest.mock('../asset-config', () => ({
    __esModule: true,
    default: {},
}));

import { createAssetPropertySchemaMap } from '../property-schema';
import AutoAtlasHandler from '../asset-handler/assets/auto-atlas';
import { FbxHandler } from '../asset-handler/assets/fbx';
import { GltfHandler } from '../asset-handler/assets/gltf';
import { ImageHandler } from '../asset-handler/assets/image';
import { SpriteFrameHandler } from '../asset-handler/assets/sprite-frame';
import { TextureHandler } from '../asset-handler/assets/texture';
import type { AssetPropertySchemaMap } from '../@types/public';
import type { ICocosConfigurationPropertySchema } from '../../configuration/script/metadata';
import i18n from '../../base/i18n';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('asset property schema map', () => {
    afterEach(async () => {
        await i18n.setLanguage('en');
    });

    it('keeps asset property schema aligned with configuration property schema', () => {
        const schema = createAssetPropertySchemaMap({
            meshType: {
                title: 'Mesh Type',
                type: 'number',
                default: 0,
                enum: [0, 1],
                enumDescriptions: ['Rect', 'Polygon'],
            },
            textureSetting: {
                title: 'Texture Setting',
                type: 'object',
                default: {
                    anisotropy: 0,
                },
                properties: {
                    anisotropy: {
                        title: 'Anisotropy',
                        type: 'number',
                        default: 0,
                        minimum: 0,
                        step: 1,
                    },
                },
            },
        });

        expect(schema.meshType).toEqual({
            title: 'Mesh Type',
            type: 'number',
            default: 0,
            enum: [0, 1],
            enumDescriptions: ['Rect', 'Polygon'],
        });
        expect(schema.textureSetting.properties?.anisotropy).toEqual({
            title: 'Anisotropy',
            type: 'number',
            default: 0,
            minimum: 0,
            step: 1,
        });
        expect(schema.meshType).not.toHaveProperty('label');
        expect(schema.meshType).not.toHaveProperty('options');
        expect(schema.meshType).not.toHaveProperty('raw');
    });

    it('returns an empty map when a handler has no explicit property schema config', () => {
        expect(createAssetPropertySchemaMap(undefined)).toEqual({});
    });

    it('localizes config-style display fields before returning the property schema', async () => {
        i18n.registerLanguagePatch('en', 'assets.propertySchemaTest', {
            field: 'Localized Field',
            help: 'Localized Help',
            option: 'Localized Option',
        });
        i18n.registerLanguagePatch('zh', 'assets.propertySchemaTest', {
            field: 'ZH Field',
            help: 'ZH Help',
            option: 'ZH Option',
        });

        const config = {
            localized: {
                title: 'i18n:assets.propertySchemaTest.field',
                description: 'i18n:assets.propertySchemaTest.help',
                type: 'string' as const,
                default: 'enabled',
                enum: ['enabled'],
                enumDescriptions: ['i18n:assets.propertySchemaTest.option'],
            },
        };

        await i18n.setLanguage('en');
        expect(createAssetPropertySchemaMap(config).localized).toMatchObject({
            title: 'Localized Field',
            description: 'Localized Help',
            enumDescriptions: ['Localized Option'],
        });

        await i18n.setLanguage('zh');
        expect(createAssetPropertySchemaMap(config).localized).toMatchObject({
            title: 'ZH Field',
            description: 'ZH Help',
            enumDescriptions: ['ZH Option'],
        });
    });

    it('builds config-style property schema from built-in asset handler declarations', () => {
        const imageSchema = createAssetPropertySchemaMap(ImageHandler.propertySchemaConfig);
        const spriteFrameSchema = createAssetPropertySchemaMap(SpriteFrameHandler.propertySchemaConfig);

        expect(imageSchema.type).toMatchObject({
            type: 'string',
            default: 'sprite-frame',
            enum: ['raw', 'texture', 'normal map', 'sprite-frame', 'texture cube'],
        });
        expect(imageSchema.type).not.toHaveProperty('label');
        expect(imageSchema.type).not.toHaveProperty('options');

        expect(spriteFrameSchema.trimType).toMatchObject({
            type: 'string',
            default: 'auto',
            enum: ['auto', 'custom', 'none'],
        });
        expect(spriteFrameSchema.trimThreshold).toMatchObject({
            type: 'number',
            minimum: 0,
            step: 1,
        });
        expect(spriteFrameSchema.trimType).not.toHaveProperty('raw');
    });

    it('keeps the Chinese AutoAtlas schema wording aligned with Creator', async () => {
        await i18n.setLanguage('zh');
        const autoAtlasSchema = createAssetPropertySchemaMap(AutoAtlasHandler.propertySchemaConfig);

        expect(autoAtlasSchema).toMatchObject({
            maxWidth: {
                title: '最大宽度',
                description: '单张图集最大宽度，超出将自动合成多张图像或无法合图',
            },
            maxHeight: {
                title: '最大高度',
                description: '单张图集最大高度，超出将自动合成多张图像或无法合图',
            },
            padding: {
                title: '间距',
                description: '图集中碎图之间的间距',
            },
            allowRotation: {
                title: '允许旋转',
                description: '是否允许旋转碎图',
            },
            forceSquared: {
                title: '输出大小为正方形',
                description: '是否强制将图集长宽大小设置成正方形',
            },
            powerOfTwo: {
                title: '二次幂',
                description: '是否将图集长宽大小设置为二次方倍数',
            },
            algorithm: {
                title: '算法',
                description: '合图策略，目前暂时只有一个选项',
            },
            paddingBleed: {
                title: '扩边',
                description: '在碎图的边框外扩展出一像素外框，并复制相邻碎图像素到外框中。该功能也称作 Extrude',
            },
            filterUnused: {
                title: '剔除未使用的图片',
                description: '仅被使用的图片会被合并进图集（仅构建阶段生效）',
            },
            removeTextureInBundle: {
                title: '剔除在 Bundle 内未被使用的 Texture2D',
                description: '剔除在 Bundle 内未被使用的 Texture2D',
            },
            removeImageInBundle: {
                title: '剔除在 Bundle 内未被使用的 ImageAsset',
                description: '剔除在 Bundle 内未被使用的 ImageAsset',
            },
            removeSpriteAtlasInBundle: {
                title: '剔除在 Bundle 内未被使用的 Sprite Atlas',
                description: '剔除在 Bundle 内未被使用的 Sprite Atlas',
            },
        });
    });

    it('keeps every built-in asset property schema description non-empty', async () => {
        const handlerSchemas: Array<[string, AssetPropertySchemaMap | undefined]> = [
            ['auto-atlas', AutoAtlasHandler.propertySchemaConfig],
            ['image', ImageHandler.propertySchemaConfig],
            ['gltf', GltfHandler.propertySchemaConfig],
            ['fbx', FbxHandler.propertySchemaConfig],
            ['sprite-frame', SpriteFrameHandler.propertySchemaConfig],
            ['texture', TextureHandler.propertySchemaConfig],
        ];
        const missingDescriptions: string[] = [];

        for (const [handlerName, schema] of handlerSchemas) {
            missingDescriptions.push(
                ...findMissingDescriptions(schema).map((path) => `raw:${handlerName}.${path}`),
            );
        }

        for (const language of ['en', 'zh']) {
            await i18n.setLanguage(language);
            for (const [handlerName, schema] of handlerSchemas) {
                const localizedSchema = createAssetPropertySchemaMap(schema);
                missingDescriptions.push(
                    ...findMissingDescriptions(localizedSchema).map((path) => `${language}:${handlerName}.${path}`),
                );
            }
        }

        expect(missingDescriptions).toEqual([]);
    });

    it('keeps built-in property schema i18n keys resolvable', () => {
        const engineAssetsI18n = require('../../../../packages/engine/editor/i18n/en/assets.js');
        const importerI18n = {
            en: JSON.parse(readFileSync(join(__dirname, '../../../../static/i18n/en/importer.json'), 'utf8')),
            zh: JSON.parse(readFileSync(join(__dirname, '../../../../static/i18n/zh/importer.json'), 'utf8')),
        };
        const files = [
            join(__dirname, '../asset-handler/assets/auto-atlas.ts'),
            join(__dirname, '../asset-handler/assets/gltf.ts'),
            join(__dirname, '../asset-handler/assets/fbx.ts'),
            join(__dirname, '../asset-handler/assets/image/index.ts'),
            join(__dirname, '../asset-handler/assets/sprite-frame.ts'),
            join(__dirname, '../asset-handler/assets/texture-base.ts'),
            join(__dirname, '../asset-handler/assets/texture.ts'),
        ];
        const missingKeys: string[] = [];

        for (const file of files) {
            const source = extractPropertySchemaSource(readFileSync(file, 'utf8'));
            for (const match of source.matchAll(/i18n:ENGINE\.([A-Za-z0-9_.]+)/g)) {
                if (readNestedValue(engineAssetsI18n, match[1]) === undefined) {
                    missingKeys.push(match[0]);
                }
            }
            for (const match of source.matchAll(/i18n:importer\.([A-Za-z0-9_.]+)/g)) {
                if (readNestedValue(importerI18n.en, match[1]) === undefined) {
                    missingKeys.push(`${match[0]}#en`);
                }
                if (readNestedValue(importerI18n.zh, match[1]) === undefined) {
                    missingKeys.push(`${match[0]}#zh`);
                }
            }
        }

        expect(missingKeys).toEqual([]);
    });
});

function readNestedValue(value: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>((result, segment) => {
        if (!result || typeof result !== 'object') {
            return undefined;
        }
        return (result as Record<string, unknown>)[segment];
    }, value);
}

function extractPropertySchemaSource(source: string): string {
    const start = [
        source.indexOf('propertySchemaConfig'),
        source.indexOf('userDataConfig'),
        source.indexOf('createTextureBasePropertySchema'),
    ].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    return start === undefined ? source : source.slice(start);
}

function findMissingDescriptions(schemaMap: AssetPropertySchemaMap | undefined): string[] {
    const missingDescriptions: string[] = [];

    function visit(schema: ICocosConfigurationPropertySchema, path: string) {
        if (typeof schema.description !== 'string' || !schema.description.trim()) {
            missingDescriptions.push(path);
        }

        for (const [key, property] of Object.entries(schema.properties ?? {})) {
            visit(property, `${path}.${key}`);
        }

        const items = Array.isArray(schema.items) ? schema.items : schema.items ? [schema.items] : [];
        items.forEach((item, index) => visit(item, `${path}.items[${index}]`));

        if (schema.additionalProperties && typeof schema.additionalProperties !== 'boolean') {
            visit(schema.additionalProperties, `${path}.additionalProperties`);
        }
    }

    for (const [key, schema] of Object.entries(schemaMap ?? {})) {
        visit(schema, key);
    }

    return missingDescriptions;
}
