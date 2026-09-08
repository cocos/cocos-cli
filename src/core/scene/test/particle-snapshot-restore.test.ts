import type { ParticleSystem } from 'cc';
import type { IProperty } from '../@types/public';
import { restoreParticleSystemSnapshot } from '../scene-process/service/dump/particle-snapshot';

function property(value: unknown, type = 'Number'): IProperty {
    return { type, path: '', value } as IProperty;
}

function fixture(useGPU = false) {
    const cpu = { uuid: 'cpu', passes: [{}] };
    const gpu = { uuid: 'gpu', passes: [{}] };
    const fallback = { uuid: 'default', passes: [{}] };
    const assets = { cpu, gpu, default: fallback, broken: { uuid: 'broken', passes: [] } };
    const writes: string[] = [];
    let active: typeof cpu | null = useGPU ? gpu : cpu;
    let processorGPU = useGPU;
    const renderer = {
        _cpuMaterial: cpu as typeof cpu | null,
        _gpuMaterial: gpu as typeof gpu | null,
        _useGPU: useGPU,
        get useGPU() { return this._useGPU; },
        set useGPU(value: boolean) {
            if (this._useGPU === value) { return; }
            this._useGPU = value;
            processorGPU = value;
            writes.push(`processor:${value}`);
            this.particleMaterial = value ? this._gpuMaterial : this._cpuMaterial;
        },
        get cpuMaterial() { return this._cpuMaterial; },
        set cpuMaterial(value: typeof cpu | null) {
            this._cpuMaterial = value;
            this.particleMaterial = value;
        },
        get gpuMaterial() { return this._gpuMaterial; },
        set gpuMaterial(value: typeof gpu | null) {
            this._gpuMaterial = value;
            this.particleMaterial = value;
        },
        get particleMaterial() { return active; },
        set particleMaterial(value: typeof cpu | null) {
            writes.push(`active:${value?.uuid ?? 'null'}`);
            active = value;
        },
        trailMaterial: null as typeof cpu | null,
        velocityScale: 1,
    };
    const component = { renderer, radius: 1 };
    const restore = async (target: object, path: string, dump: IProperty) => {
        const keys = path.split('.');
        let parent = target as Record<string, unknown>;
        for (const key of keys.slice(0, -1)) { parent = parent[key] as Record<string, unknown>; }
        const uuid = (dump.value as { uuid?: keyof typeof assets } | null)?.uuid;
        parent[keys.at(-1)!] = dump.type === 'cc.Material' ? (uuid ? assets[uuid] : null) : dump.value;
    };
    const snapshot = (targetGPU: boolean, cpuUuid = 'cpu', gpuUuid = 'gpu', activeUuid = targetGPU ? gpuUuid : cpuUuid) => property({
        uuid: property('component-id', 'String'),
        radius: property(5),
        // These aliases must not replay material setters outside the mode-aware restoration.
        sharedMaterials: property([]),
        _materials: property([]),
        renderer: property({
            cpuMaterial: property({ uuid: cpuUuid }, 'cc.Material'),
            _cpuMaterial: property({ uuid: cpuUuid }, 'cc.Material'),
            gpuMaterial: property({ uuid: gpuUuid }, 'cc.Material'),
            _gpuMaterial: property({ uuid: gpuUuid }, 'cc.Material'),
            particleMaterial: property({ uuid: activeUuid }, 'cc.Material'),
            _useGPU: property(targetGPU, 'Boolean'),
            useGPU: property(targetGPU, 'Boolean'),
            velocityScale: property(3),
            trailMaterial: property({ uuid: 'cpu' }, 'cc.Material'),
        }, 'cc.ParticleSystemRenderer'),
    }, 'cc.ParticleSystem');
    return {
        component, renderer, assets, writes, snapshot,
        apply: (dump: IProperty) => restoreParticleSystemSnapshot(component as unknown as ParticleSystem, dump, restore),
        state: () => ({ active: active?.uuid, cpu: renderer.cpuMaterial?.uuid, gpu: renderer.gpuMaterial?.uuid, processorGPU }),
    };
}

describe('particle snapshot material restoration', () => {
    it.each(['', 'gpu'])('preserves the CPU material when the inactive GPU material is %s', async gpu => {
        const f = fixture();
        await f.apply(f.snapshot(false, 'cpu', gpu));
        expect({ ...f.state(), radius: f.component.radius, velocity: f.renderer.velocityScale }).toEqual({
            active: 'cpu', cpu: 'cpu', gpu: gpu || undefined, processorGPU: false, radius: 5, velocity: 3,
        });
        expect(f.writes).toEqual(['active:cpu']);
    });

    it('preserves GPU mode when the inactive CPU material is empty', async () => {
        const f = fixture(true);
        await f.apply(f.snapshot(true, '', 'gpu'));
        expect(f.state()).toEqual({ active: 'gpu', cpu: undefined, gpu: 'gpu', processorGPU: true });
        expect(f.writes).toEqual(['active:gpu']);
    });

    it('restores the effective default material even when the mode cache is empty', async () => {
        const f = fixture();
        await f.apply(f.snapshot(false, '', '', 'default'));
        expect(f.state()).toEqual({ active: 'default', cpu: undefined, gpu: undefined, processorGPU: false });
    });

    it('switches the processor on Undo and Redo without replaying the raw mode alias', async () => {
        const f = fixture(true);
        for (const mode of [false, true, false, true]) {
            await f.apply(f.snapshot(mode));
            expect(f.state()).toEqual({ active: mode ? 'gpu' : 'cpu', cpu: 'cpu', gpu: 'gpu', processorGPU: mode });
        }
        expect(f.writes.filter(value => value.startsWith('processor:'))).toEqual([
            'processor:false', 'processor:true', 'processor:false', 'processor:true',
        ]);
    });

    it('restores custom material changes and trail fields without mutating the snapshot', async () => {
        const f = fixture();
        const dump = f.snapshot(false, 'default', 'gpu');
        const original = JSON.stringify(dump);
        await f.apply(dump);
        expect({ state: f.state(), trail: f.renderer.trailMaterial?.uuid }).toEqual({
            state: { active: 'default', cpu: 'default', gpu: 'gpu', processorGPU: false }, trail: 'cpu',
        });
        expect(JSON.stringify(dump)).toBe(original);
    });

    it('rejects an invalid material before mutating the live component', async () => {
        const f = fixture();
        await expect(f.apply(f.snapshot(false, 'broken'))).rejects.toThrow('without render passes');
        expect({ state: f.state(), radius: f.component.radius, writes: f.writes }).toEqual({
            state: { active: 'cpu', cpu: 'cpu', gpu: 'gpu', processorGPU: false }, radius: 1, writes: [],
        });
    });
});
