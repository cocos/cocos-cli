import 'reflect-metadata';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import {
    SchemaReflectionProbeBakeOptions,
    SchemaReflectionProbeBakeResult,
} from '../src/api/scene/reflection-probe-schema';

const mockBake = jest.fn();

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
        },
    },
}));

import { ReflectionProbeApi } from '../src/api/scene/reflection-probe';

describe('reflection probe bake API', () => {
    beforeEach(() => mockBake.mockReset());

    it('applies safe defaults and rejects invalid input', () => {
        expect(SchemaReflectionProbeBakeOptions.parse({ nodePath: 'Probe' })).toEqual({
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
            fastBake: true,
            saveScene: true,
            timeoutMs: 120_000,
        });

        expect(mockBake).toHaveBeenCalledWith({
            nodePath: 'Probe',
            fastBake: true,
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
});
