import { installLightProbeNormalReset } from '../scene-process/light-probe-normal-reset';

function createEngine(updateTetrahedrons: (...args: unknown[]) => unknown) {
    return {
        internal: {
            LightProbesData: {
                prototype: { updateTetrahedrons },
            },
        },
    };
}

describe('light probe normal reset', () => {
    it('clears restored normals before rebuilding tetrahedrons', () => {
        const observed: number[][] = [];
        const original = jest.fn(function (this: { probes: Array<{ normal: { values: number[] } }> }, token: string) {
            observed.push(...this.probes.map(probe => [...probe.normal.values]));
            return token;
        });
        const engine = createEngine(original as unknown as (...args: unknown[]) => unknown);
        const data = {
            probes: [
                { normal: { values: [1, 2, 3], set(x: number, y: number, z: number) { this.values = [x, y, z]; } } },
                { normal: { values: [-1, 4, 8], set(x: number, y: number, z: number) { this.values = [x, y, z]; } } },
            ],
        };

        expect(installLightProbeNormalReset(engine)).toBe(true);
        expect(engine.internal.LightProbesData.prototype.updateTetrahedrons.call(data, 'result')).toBe('result');
        expect(observed).toEqual([[0, 0, 0], [0, 0, 0]]);
        expect(original).toHaveBeenCalledTimes(1);
    });

    it('installs only once and tolerates missing probe data', () => {
        const original = jest.fn();
        const engine = createEngine(original);

        expect(installLightProbeNormalReset(engine)).toBe(true);
        const patched = engine.internal.LightProbesData.prototype.updateTetrahedrons;
        expect(installLightProbeNormalReset(engine)).toBe(false);
        expect(engine.internal.LightProbesData.prototype.updateTetrahedrons).toBe(patched);
        expect(() => patched.call({})).not.toThrow();
        expect(original).toHaveBeenCalledTimes(1);
        expect(installLightProbeNormalReset({})).toBe(false);
    });
});
