import { LightFXBakeTarget, LightFXSettings } from './types';

export function createDefaultLightFXSettings(target: LightFXBakeTarget): LightFXSettings {
    return {
        msaa: 4,
        size: 1024,
        gamma: 2.2,
        highp: false,
        skyRadiance: [0, 0, 0],
        giScale: 1,
        giSamples: 25,
        giPathLength: 4,
        giProbeScale: 1,
        giProbeSamples: 1024,
        giProbePathLength: 2,
        aoLevel: 0,
        aoStrength: 0.5,
        aoRadius: 1,
        aoColor: [136, 136, 136],
        threads: 1,
        filter: true,
        bakeLightmap: target === 'lightmap',
        bakeLightProbe: target === 'light-probe',
    };
}
