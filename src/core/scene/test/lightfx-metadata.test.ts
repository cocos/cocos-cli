jest.mock('cc', () => {
    class ValueType {}
    class Vec3 extends ValueType {
        static __props__ = ['x', 'y', 'z'];
        constructor(public x = 0, public y = 0, public z = 0) { super(); }
    }
    return {
        ValueType, Vec3,
        Texture2D: class Texture2D {},
        Node: class Node {},
        Component: class Component {},
        Asset: class Asset {},
        js: {
            getClassName: (value: any) => {
                if (value?.type) return value.type;
                const name = typeof value === 'function' ? value.name : value?.constructor?.name;
                return name && ['Vertex', 'Vec3', 'ValueType'].includes(name) ? `cc.${name}` : 'cc.Other';
            },
            isChildClassOf: (ctor: any, base: any) => !!ctor && !!base && (ctor === base || ctor.prototype instanceof base),
        },
        Class: {
            attr: () => ({ default: 0 }),
            getInheritanceChain: (ctor: unknown) => ctor === Vec3 ? [ValueType] : [],
        },
    };
});
jest.mock('../scene-process/service/dump/dump-defines', () => ({
    DumpDefines: { 'cc.ValueType': jest.requireActual('../scene-process/service/dump/types/value-type-dump').valueTypeDump },
}));
jest.mock('../scene-process/service/dump/service-access', () => ({}));
jest.mock('../scene-process/service/dump/particle-inspector-metadata', () => ({ applyParticleInspectorMetadata: jest.fn() }));
jest.mock('../scene-process/service/prefab/utils', () => ({}));
jest.mock('../scene-process/service/core', () => ({ Service: {} }));
jest.mock('../scene-process/i18n', () => ({ __esModule: true, default: { transI18nName: (value: string) => value } }));

import { Vec3, Texture2D } from 'cc';
import * as engine from 'cc';
import { withLightProbeCoefficientType } from '../scene-process/service/dump/light-probe-metadata';
import { withLightmapTextureType } from '../scene-process/service/dump/lightmap-metadata';
import { encodeObject } from '../scene-process/service/dump/encode';
import { valueTypeDump } from '../scene-process/service/dump/types/value-type-dump';
import type { IProperty } from '../@types/public';

class Vertex { coefficients: Vec3[] = []; }

describe('Light probe dump metadata', () => {
    it('supplies Vec3 for legacy SH arrays without mutating engine attributes', () => {
        const attributes = Object.freeze({ default: () => [], serializable: true, visible: false });
        const owner = new Vertex();
        expect(withLightProbeCoefficientType(attributes, owner, 'coefficients')).toEqual({ ...attributes, ctor: Vec3 });
        expect(attributes).not.toHaveProperty('ctor');
    });

    it('preserves an engine-provided element constructor', () => {
        const attributes = { ctor: Vec3, serializable: true };
        expect(withLightProbeCoefficientType(attributes, new Vertex(), 'coefficients')).toBe(attributes);
    });

    it.each([
        [new Vertex(), 'position'],
        [{ coefficients: [] }, 'coefficients'],
        [null, 'coefficients'],
    ])('does not change unrelated metadata (%p, %s)', (owner, key) => {
        const attributes = { ctor: undefined, default: () => [] };
        expect(withLightProbeCoefficientType(attributes, owner, key)).toBe(attributes);
    });
});

describe('Lightmap texture snapshot metadata', () => {
    it.each(['cc.ModelBakeSettings', 'cc.TerrainBlockLightmapInfo'])('types even cleared texture references on %s without changing engine metadata', type => {
        const attributes = Object.freeze({ default: null });
        expect(withLightmapTextureType(attributes, { type }, 'texture')).toEqual({ default: null, ctor: Texture2D });
        expect(attributes).toEqual({ default: null });
    });
    it('preserves declared constructors', () => {
        const attributes = { ctor: class CustomTexture {} };
        expect(withLightmapTextureType(attributes, { type: 'cc.ModelBakeSettings' }, 'texture')).toBe(attributes);
    });
    it.each([[null, 'texture'], [{ type: 'cc.Other' }, 'texture'], [{ type: 'cc.ModelBakeSettings' }, 'uvParam']])('does not change unrelated properties (%p, %s)', (owner, key) => {
        const attributes = {};
        expect(withLightmapTextureType(attributes, owner as object | null, key as string)).toBe(attributes);
    });
});

describe('Value-type dump templates through the real encoder', () => {
    const globals = globalThis as typeof globalThis & { cc?: unknown; EditorExtends?: unknown };
    let previousCC: unknown;
    let previousExtends: unknown;
    let warn: jest.SpyInstance;
    const serialize = jest.fn((value: Vec3 | null | undefined) => value == null
        ? value : { __type__: 'cc.Vec3', x: value.x, y: value.y, z: value.z });

    beforeEach(() => {
        previousCC = globals.cc;
        previousExtends = globals.EditorExtends;
        globals.cc = engine;
        globals.EditorExtends = { serialize };
        serialize.mockClear();
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        globals.cc = previousCC;
        globals.EditorExtends = previousExtends;
        warn.mockRestore();
    });

    it.each([0, 9])('encodes %i SH coefficients and a default Vec3 template without serializing null', count => {
        const owner = new Vertex();
        owner.coefficients = Array.from({ length: count }, (_, index) => new Vec3(index, index + 1, index + 2));
        const before = owner.coefficients.map(value => ({ x: value.x, y: value.y, z: value.z }));
        const attributes = { default: () => [], serializable: true, visible: false };

        const dump = encodeObject(owner.coefficients, attributes, owner, 'coefficients');

        expect(dump).toMatchObject({
            type: 'cc.Vec3', isArray: true,
            elementTypeData: { type: 'cc.Vec3', value: { x: 0, y: 0, z: 0 } },
            value: before.map(value => expect.objectContaining({ type: 'cc.Vec3', value })),
        });
        expect(owner.coefficients).toEqual(before);
        expect(attributes).not.toHaveProperty('ctor');
        expect(serialize).toHaveBeenCalledTimes(count + 1);
        expect(serialize.mock.calls.every(([value]) => value instanceof Vec3)).toBe(true);
        expect(warn).not.toHaveBeenCalled();
    });

    it.each([null, undefined])('normalizes a generic %p value-type template to its constructor default', value => {
        const dump = {} as IProperty;

        valueTypeDump.encode(value, dump, { ctor: Vec3 });

        expect(dump.value).toEqual({ x: 0, y: 0, z: 0 });
        expect(serialize).toHaveBeenCalledTimes(1);
        expect(serialize.mock.calls[0][0]).toBeInstanceOf(Vec3);
        expect(warn).not.toHaveBeenCalled();
    });

    it('retains diagnostics and the constructor fallback for a genuine serialization failure', () => {
        const failure = new Error('Cannot serialize this value');
        const input = new Vec3(1, 2, 3);
        const dump = {} as IProperty;
        serialize.mockImplementationOnce(() => { throw failure; });

        valueTypeDump.encode(input, dump, { ctor: Vec3 });

        expect(warn.mock.calls).toEqual([['Value dump failed.'], [failure]]);
        expect(serialize).toHaveBeenCalledTimes(2);
        expect(serialize.mock.calls[0][0]).toBe(input);
        expect(serialize.mock.calls[1][0]).toBeInstanceOf(Vec3);
        expect(dump.value).toEqual({ x: 0, y: 0, z: 0 });
        expect(input).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('propagates a failed fallback instead of reporting a successful dump', () => {
        const failure = new Error('Serializer unavailable');
        const fallbackFailure = new Error('Default serialization failed');
        serialize.mockImplementationOnce(() => { throw failure; });
        serialize.mockImplementationOnce(() => { throw fallbackFailure; });

        expect(() => valueTypeDump.encode(new Vec3(), {} as IProperty, { ctor: Vec3 })).toThrow(fallbackFailure);
        expect(warn.mock.calls).toEqual([['Value dump failed.'], [failure]]);
    });
});
