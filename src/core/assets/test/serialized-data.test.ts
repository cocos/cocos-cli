'use strict';

jest.mock('gl', () => {
    const createShader = (type: number) => ({ type });
    const noop = () => undefined;
    return () => ({
        VERTEX_SHADER: 35633,
        FRAGMENT_SHADER: 35632,
        COMPILE_STATUS: 35713,
        LINK_STATUS: 35714,
        getSupportedExtensions: () => [],
        getExtension: noop,
        createShader,
        shaderSource: noop,
        compileShader: noop,
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        deleteShader: noop,
        createProgram: () => ({}),
        attachShader: noop,
        linkProgram: noop,
        getProgramParameter: () => true,
        getProgramInfoLog: () => '',
        deleteProgram: noop,
    });
});

import { join } from 'path';
import { readFileSync, readJSONSync, remove } from 'fs-extra';
import { globalSetup } from '../../test/global-setup';
import { TestGlobalEnv } from '../../../tests/global-env';
import { assetManager } from '..';
import type { IProperty } from '../../scene/@types/public';

type DumpMap = Record<string, IProperty>;

describe('serialized asset data', function () {
    const name = `serialized-data-${Date.now()}`;

    beforeAll(async () => {
        await globalSetup();
    });

    afterAll(async () => {
        try {
            await assetManager.removeAsset(TestGlobalEnv.testRootUrl);
        } catch (error) {
            // Test root may already be absent if a previous test cleaned it.
        }
        await remove(TestGlobalEnv.testRoot);
        await remove(TestGlobalEnv.testRoot + '.meta');
    });

    it('queries PhysicsMaterial as a Creator-compatible field dump map', async () => {
        const assetInfo = await assetManager.createAssetByType(
            'physics-material',
            TestGlobalEnv.testRoot,
            `${name}-physics`,
            { overwrite: true },
        );

        const result = await assetManager.querySerializedData(assetInfo.uuid);
        const dump = result.dump as DumpMap;

        expect(result.uuid).toBe(assetInfo.uuid);
        expect(result.url).toBe(assetInfo.url);
        expect(result.type).toBe('cc.PhysicsMaterial');
        expect(result.importer).toBe('physics-material');
        expect(dump.friction).toMatchObject({
            name: 'friction',
            type: 'Float',
            value: 0.5,
            visible: true,
        });
        expect(dump.restitution).toMatchObject({
            name: 'restitution',
            type: 'Float',
            value: 0.1,
            visible: true,
        });
    });

    it('saves a PhysicsMaterial IProperty patch and reads the fresh value back', async () => {
        const assetInfo = await assetManager.createAssetByType(
            'physics-material',
            TestGlobalEnv.testRoot,
            `${name}-physics-save`,
            { overwrite: true },
        );

        const before = await assetManager.querySerializedData(assetInfo.uuid);
        const beforeDump = before.dump as DumpMap;

        await assetManager.saveSerializedData(assetInfo.uuid, {
            friction: { ...beforeDump.friction, value: 0.25 },
        });

        const after = await assetManager.querySerializedData(assetInfo.uuid);
        const afterDump = after.dump as DumpMap;
        const source = readJSONSync(assetInfo.file);

        expect(afterDump.friction.value).toBe(0.25);
        expect(source._friction).toBe(0.25);
    });

    it('rejects unknown serialized fields without changing the source file', async () => {
        const assetInfo = await assetManager.createAssetByType(
            'physics-material',
            TestGlobalEnv.testRoot,
            `${name}-unknown-field`,
            { overwrite: true },
        );
        const beforeSource = readFileSync(assetInfo.file, 'utf8');

        await expect(assetManager.saveSerializedData(assetInfo.uuid, {
            unknown: { value: 1, type: 'Float', path: 'unknown' } as IProperty,
        })).rejects.toThrow(/unknown serialized field/i);

        expect(readFileSync(assetInfo.file, 'utf8')).toBe(beforeSource);
    });

    it('rejects explicit changes to hidden or readonly fields', async () => {
        const assetInfo = await assetManager.createAssetByType(
            'physics-material',
            TestGlobalEnv.testRoot,
            `${name}-hidden-field`,
            { overwrite: true },
        );
        const result = await assetManager.querySerializedData(assetInfo.uuid);
        const dump = result.dump as DumpMap;
        const protectedKey = Object.keys(dump).find((key) => dump[key].visible === false || dump[key].readonly === true);

        expect(protectedKey).toBeDefined();
        const protectedProp = dump[protectedKey!];

        await expect(assetManager.saveSerializedData(assetInfo.uuid, {
            [protectedKey!]: {
                ...protectedProp,
                value: typeof protectedProp.value === 'number' ? protectedProp.value + 1 : '__changed__',
            },
        })).rejects.toThrow(/readonly|hidden/i);
    });

    it('queries RenderPipeline as a top-level IProperty with optionalTypes', async () => {
        const fixture = join(
            TestGlobalEnv.engineRoot,
            'editor/assets/default_file_content/render-pipeline/default.rpp',
        );
        const assetInfo = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-pipeline.rpp`),
            content: readFileSync(fixture, 'utf8'),
            overwrite: true,
        });

        const result = await assetManager.querySerializedData(assetInfo.uuid);
        const dump = result.dump as IProperty;
        const value = dump.value as DumpMap;

        expect(result.type).toBe('cc.RenderPipeline');
        expect(result.importer).toBe('render-pipeline');
        expect(dump).toMatchObject({
            name: 'Pipeline',
            visible: true,
            readonly: false,
        });
        expect(Array.isArray(dump.optionalTypes)).toBe(true);
        expect(value._flows).toMatchObject({
            name: '_flows',
            isArray: true,
        });
    });

    it('saves a RenderPipeline nested IProperty patch and reads the fresh value back', async () => {
        const fixture = join(
            TestGlobalEnv.engineRoot,
            'editor/assets/default_file_content/render-pipeline/forward-pipeline.rpp',
        );
        const assetInfo = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-pipeline-save.rpp`),
            content: readFileSync(fixture, 'utf8'),
            overwrite: true,
        });

        const before = await assetManager.querySerializedData(assetInfo.uuid);
        const dump = before.dump as IProperty;
        const value = dump.value as DumpMap;
        const flows = value._flows.value as IProperty[];
        const firstFlow = flows[0];
        const firstFlowValue = firstFlow.value as DumpMap;

        expect(firstFlowValue._priority.value).toBe(0);

        await assetManager.saveSerializedData(assetInfo.uuid, {
            ...dump,
            value: {
                ...value,
                _flows: {
                    ...value._flows,
                    value: flows.map((flow, index) => index === 0 ? {
                        ...flow,
                        value: {
                            ...(flow.value as DumpMap),
                            _priority: {
                                ...((flow.value as DumpMap)._priority),
                                value: 3,
                            },
                        },
                    } : flow),
                },
            },
        });

        const after = await assetManager.querySerializedData(assetInfo.uuid);
        const afterDump = after.dump as IProperty;
        const afterValue = afterDump.value as DumpMap;
        const afterFlows = afterValue._flows.value as IProperty[];
        const afterFirstFlowValue = afterFlows[0].value as DumpMap;
        const source = readJSONSync(assetInfo.file);

        expect(afterFirstFlowValue._priority.value).toBe(3);
        expect(source[1]._priority).toBe(3);
    });

    it('rejects unknown nested RenderPipeline fields without changing the source file', async () => {
        const fixture = join(
            TestGlobalEnv.engineRoot,
            'editor/assets/default_file_content/render-pipeline/forward-pipeline.rpp',
        );
        const assetInfo = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-pipeline-unknown.rpp`),
            content: readFileSync(fixture, 'utf8'),
            overwrite: true,
        });

        const result = await assetManager.querySerializedData(assetInfo.uuid);
        const dump = result.dump as IProperty;
        const value = dump.value as DumpMap;
        const flows = value._flows.value as IProperty[];
        const firstFlow = flows[0];
        const beforeSource = readFileSync(assetInfo.file, 'utf8');

        expect(firstFlow).toBeDefined();

        await expect(assetManager.saveSerializedData(assetInfo.uuid, {
            ...dump,
            value: {
                ...value,
                _flows: {
                    ...value._flows,
                    value: flows.map((flow, index) => index === 0 ? {
                        ...flow,
                        value: {
                            ...(flow.value as DumpMap),
                            __unknown: {
                                name: '__unknown',
                                path: '_flows.0.__unknown',
                                type: 'Float',
                                value: 1,
                            },
                        },
                    } : flow),
                },
            },
        })).rejects.toThrow(/unknown serialized field/i);

        expect(readFileSync(assetInfo.file, 'utf8')).toBe(beforeSource);
    });

    it('rejects unsupported asset types', async () => {
        const assetInfo = await assetManager.createAsset({
            target: join(TestGlobalEnv.testRoot, `${name}-text.txt`),
            content: 'plain text',
            overwrite: true,
        });

        await expect(assetManager.querySerializedData(assetInfo.uuid)).rejects.toThrow(/unsupported serialized asset type/i);
    });
});
