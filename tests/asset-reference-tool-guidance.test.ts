import 'reflect-metadata';

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {},
}));

jest.mock('../src/core/scene', () => ({
    Scene: {},
}));

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: (desc: string) => (target: object, propertyKey: string | symbol) => {
        Reflect.defineMetadata(`tool:description:${propertyKey.toString()}`, desc, target);
    },
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

import { AssetsApi } from '../src/api/assets/assets';
import { ComponentApi } from '../src/api/scene/component';

describe('Asset reference tool guidance', () => {
    it('explains component Asset type validation and unique sub-asset normalization', () => {
        const description = Reflect.getOwnMetadata('tool:description:setProperty', ComponentApi.prototype);

        expect(description).toContain('scene-query-component');
        expect(description).toContain('Asset reference');
        expect(description).toContain('exactly one compatible sub-asset');
        expect(description).toContain('return 400 without modifying');
    });

    it('explains that query UUID returns the exact parent resource', () => {
        const description = Reflect.getOwnMetadata('tool:description:queryUUID', AssetsApi.prototype);

        expect(description).toContain('exact asset');
        expect(description).toContain('parent ImageAsset UUID');
        expect(description).toContain('assets-query-asset-info');
        expect(description).toContain('subAssets');
    });

    it('explains how to select typed sub-assets from detailed asset info', () => {
        const description = Reflect.getOwnMetadata('tool:description:queryAssetInfo', AssetsApi.prototype);

        expect(description).toContain('By default the result includes subAssets');
        expect(description).toContain('type === "cc.SpriteFrame"');
        expect(description).toContain('"extends"');
    });
});
