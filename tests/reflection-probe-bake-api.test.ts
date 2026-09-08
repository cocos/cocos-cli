import 'reflect-metadata';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import {
    SchemaReflectionProbeBakeAllOptions,
    SchemaReflectionProbeBakeAllResult,
    SchemaReflectionProbeBakeOptions,
    SchemaReflectionProbeBakeResult,
    SchemaReflectionProbeClearOptions,
    SchemaReflectionProbeClearResult,
} from '../src/api/scene/reflection-probe-schema';

const mockBake = jest.fn();
const mockBakeAll = jest.fn();
const mockClearAll = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    Scene: {
        ReflectionProbe: {
            bake: (...args: unknown[]) => mockBake(...args),
            bakeAll: (...args: unknown[]) => mockBakeAll(...args),
            clearAll: (...args: unknown[]) => mockClearAll(...args),
        },
    },
}));

import { ReflectionProbeApi } from '../src/api/scene/reflection-probe';

describe('reflection probe bake API', () => {
    beforeEach(() => {
        mockBake.mockReset();
        mockBakeAll.mockReset();
        mockClearAll.mockReset();
    });

    it('applies safe defaults and rejects invalid input', () => {
        expect(SchemaReflectionProbeBakeOptions.parse({ nodePath: 'Probe' })).toEqual({
            nodePath: 'Probe',
            saveScene: true,
            timeoutMs: 120_000,
        });
        expect(SchemaReflectionProbeBakeOptions.parse({ nodePath: 'Probe', fastBake: true })).toEqual({
            nodePath: 'Probe',
            saveScene: true,
            timeoutMs: 120_000,
        });
        expect(() => SchemaReflectionProbeBakeOptions.parse({ nodePath: ' ' })).toThrow();
        expect(() => SchemaReflectionProbeBakeOptions.parse({ nodePath: 'Probe', timeoutMs: 0 })).toThrow();
        expect(() => SchemaReflectionProbeBakeOptions.parse({ nodePath: 'Probe', timeoutMs: 600_001 })).toThrow();
    });

    it('accepts the public result shape', () => {
        expect(SchemaReflectionProbeBakeResult.parse({
            nodePath: 'Probe',
            componentUuid: 'component-uuid',
            probeId: 3,
            cubemapUuid: 'cubemap-uuid',
            cubemapUrl: 'db://assets/Main/reflectionProbe_3.png/textureCube',
            fastBake: true,
        }).probeId).toBe(3);
    });

    it('applies bake-all defaults and accepts success and failure details', () => {
        expect(SchemaReflectionProbeBakeAllOptions.parse({})).toEqual({
            saveScene: true,
            timeoutMs: 600_000,
        });
        expect(SchemaReflectionProbeBakeAllOptions.parse({ nodePaths: [] }).nodePaths).toEqual([]);
        expect(() => SchemaReflectionProbeBakeAllOptions.parse({ nodePaths: [' '] })).toThrow();
        expect(() => SchemaReflectionProbeBakeAllOptions.parse({ timeoutMs: 3_600_001 })).toThrow();

        expect(SchemaReflectionProbeBakeAllResult.parse({
            sceneUrl: 'db://assets/Main.scene',
            totalCount: 2,
            bakedCount: 1,
            failedCount: 1,
            results: [{
                nodePath: 'Probe A',
                componentUuid: 'component-a',
                probeId: 1,
                cubemapUuid: 'cube-a',
                cubemapUrl: 'db://assets/Main/reflectionProbe_1.png/textureCube',
                fastBake: true,
            }],
            failures: [{ nodePath: 'Probe B', componentUuid: 'component-b', reason: 'cmft failed' }],
            durationMs: 100,
        }).failedCount).toBe(1);
    });

    it('forwards options and wraps success', async () => {
        const data = {
            nodePath: 'Probe',
            componentUuid: 'component-uuid',
            probeId: 1,
            cubemapUuid: 'cube-uuid',
            cubemapUrl: 'db://assets/Main/reflectionProbe_1.png/textureCube',
            fastBake: true,
        };
        mockBake.mockResolvedValue(data);

        const result = await new ReflectionProbeApi().bake({
            nodePath: 'Probe',
            saveScene: true,
            timeoutMs: 120_000,
        });

        expect(mockBake).toHaveBeenCalledWith({
            nodePath: 'Probe',
            saveScene: true,
            timeoutMs: 120_000,
        });
        expect(result).toEqual({ code: COMMON_STATUS.SUCCESS, data });
    });

    it('wraps service failures', async () => {
        mockBake.mockRejectedValue(new Error('cmft failed'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await new ReflectionProbeApi().bake({
            nodePath: 'Probe',
            saveScene: true,
            timeoutMs: 120_000,
        });

        expect(result).toEqual({ code: COMMON_STATUS.FAIL, reason: 'cmft failed' });
        errorSpy.mockRestore();
    });

    it('forwards bake-all options and wraps success', async () => {
        const data = {
            sceneUrl: 'db://assets/Main.scene',
            totalCount: 0,
            bakedCount: 0,
            failedCount: 0,
            results: [],
            failures: [],
            durationMs: 1,
        };
        mockBakeAll.mockResolvedValue(data);

        await expect(new ReflectionProbeApi().bakeAll({
            nodePaths: [],
            saveScene: true,
            timeoutMs: 600_000,
        })).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data });
        expect(mockBakeAll).toHaveBeenCalledWith({
            nodePaths: [],
            saveScene: true,
            timeoutMs: 600_000,
        });
    });

    it('applies clear-all defaults and accepts its result shape', () => {
        expect(SchemaReflectionProbeClearOptions.parse({})).toEqual({
            saveScene: true,
            deleteAssets: true,
            timeoutMs: 120_000,
        });
        expect(() => SchemaReflectionProbeClearOptions.parse({
            saveScene: false,
            deleteAssets: true,
        })).toThrow();
        expect(() => SchemaReflectionProbeClearOptions.parse({ timeoutMs: 600_001 })).toThrow();
        expect(SchemaReflectionProbeClearResult.parse({
            sceneUrl: 'db://assets/Main.scene',
            totalCount: 2,
            clearedCount: 2,
            deletedAssetUrls: ['db://assets/Main/reflectionProbe_0.png'],
            failures: [],
            durationMs: 12,
        }).clearedCount).toBe(2);
    });

    it('forwards clear-all options and wraps success', async () => {
        const data = {
            sceneUrl: 'db://assets/Main.scene',
            totalCount: 1,
            clearedCount: 1,
            deletedAssetUrls: ['db://assets/Main/reflectionProbe_0.png'],
            failures: [],
            durationMs: 10,
        };
        mockClearAll.mockResolvedValue(data);

        await expect(new ReflectionProbeApi().clearAll({
            saveScene: true,
            deleteAssets: true,
            timeoutMs: 120_000,
        })).resolves.toEqual({ code: COMMON_STATUS.SUCCESS, data });
        expect(mockClearAll).toHaveBeenCalledWith({
            saveScene: true,
            deleteAssets: true,
            timeoutMs: 120_000,
        });
    });
});
