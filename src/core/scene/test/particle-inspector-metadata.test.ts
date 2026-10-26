import type { IProperty } from '../@types/public';
import type { IComponent } from '../common/component';
import { applyParticleInspectorMetadata } from '../scene-process/service/dump/particle-inspector-metadata';

function property(value: IProperty['value'], metadata: Partial<IProperty> = {}): IProperty {
    return { value, type: 'Number', path: 'unchanged', visible: true, readonly: false, ...metadata };
}

function component(type: string, fields: Record<string, IProperty>): IComponent {
    return { type, path: '', value: { uuid: property('id'), name: property('name'), enabled: property(true), ...fields } };
}

const shapeTypes = ['Box', 'Circle', 'Cone', 'Sphere', 'Hemisphere'].map((name, value) => ({ name, value }));
const emitLocations = ['Base', 'Edge', 'Shell', 'Volume'].map((name, value) => ({ name, value, displayName: `Label ${name}` }));

function particle3D(useGPU = false, shapeType = 2) {
    const renderer = {
        useGPU: property(useGPU),
        cpuMaterial: property({ uuid: 'cpu' }),
        gpuMaterial: property({ uuid: 'gpu' }),
        trailMaterial: property({ uuid: 'trail' }),
    };
    const shape = {
        shapeType: property(shapeType, { enumList: shapeTypes }),
        emitFrom: property(3, { enumList: emitLocations, visible: shapeType !== 1 }),
    };
    const dump = component('cc.ParticleSystem', {
        renderer: property(renderer), shapeModule: property(shape),
        trailModule: property({ enable: property(true), width: property(12) }),
        limitVelocityOvertimeModule: property({ limit: property(17) }),
    });
    return { dump, renderer, shape };
}

const gravity = ['gravity', 'speed', 'speedVar', 'tangentialAccel', 'tangentialAccelVar', 'radialAccel', 'radialAccelVar', 'rotationIsDir'];
const radius = ['startRadius', 'startRadiusVar', 'endRadius', 'endRadiusVar', 'rotatePerS', 'rotatePerSVar'];
const independent = ['customMaterial', 'color', 'preview', 'playOnLoad', 'autoRemoveOnFinish', 'file', 'custom'];

function particle2D(custom = true, mode = 0) {
    const fields = Object.fromEntries([...gravity, ...radius, ...independent, 'totalParticles', '_custom'].map(name => [name, property(42)]));
    fields.custom = property(custom);
    fields.emitterMode = property(mode);
    fields._custom.visible = false;
    return component('cc.ParticleSystem2D', fields);
}

describe('particle Inspector metadata', () => {
    it.each([false, true, false, true])('derives fresh CPU/GPU restrictions (%s)', useGPU => {
        const { dump, renderer } = particle3D(useGPU);
        applyParticleInspectorMetadata(dump);
        expect({
            trail: dump.value.trailModule.visible,
            limit: dump.value.limitVelocityOvertimeModule.visible,
            materials: [renderer.cpuMaterial, renderer.gpuMaterial, renderer.trailMaterial].map(field => field.readonly),
        }).toEqual({ trail: !useGPU, limit: !useGPU, materials: [useGPU, !useGPU, useGPU] });
    });

    it.each(['field', 'renderer', 'component'])('retains %s readonly restrictions on the active material', level => {
        const { dump, renderer } = particle3D();
        if (level === 'field') { renderer.cpuMaterial.readonly = true; }
        if (level === 'renderer') { dump.value.renderer.readonly = true; }
        if (level === 'component') { dump.readonly = true; }
        applyParticleInspectorMetadata(dump);
        expect(renderer.cpuMaterial.readonly).toBe(true);
    });

    it('never reopens fields already hidden by engine metadata', () => {
        const { dump, shape } = particle3D();
        dump.value.trailModule.visible = false;
        shape.emitFrom.visible = false;
        applyParticleInspectorMetadata(dump);
        const twoD = particle2D();
        twoD.value.speed.visible = false;
        applyParticleInspectorMetadata(twoD);
        expect([dump.value.trailModule.visible, shape.emitFrom.visible, twoD.value.speed.visible, twoD.value._custom.visible])
            .toEqual([false, false, false, false]);
    });

    it.each([
        [0, ['Volume', 'Shell', 'Edge']],
        [1, []],
        [2, ['Base', 'Shell', 'Volume']],
        [3, ['Volume', 'Shell']],
        [4, ['Volume', 'Shell']],
    ] as const)('uses the Creator choices and order for shape %s', (shapeType, names) => {
        const { dump, shape } = particle3D(false, shapeType);
        applyParticleInspectorMetadata(dump);
        expect(shape.emitFrom.enumList).toEqual(names.map(name => emitLocations.find(option => option.name === name)));
        expect(shape.emitFrom.enumList).not.toBe(emitLocations);
        expect(shape.emitFrom.visible).toBe(shapeType !== 1);
    });

    it('does not mutate enum definitions shared by multiple instances', () => {
        const original = structuredClone(emitLocations);
        for (const shapeType of [0, 2, 3, 4, 1, 0]) {
            const { dump, shape } = particle3D(false, shapeType);
            applyParticleInspectorMetadata(dump);
            if (shape.emitFrom.enumList?.[0]) { shape.emitFrom.enumList[0].name = 'local change'; }
        }
        expect(emitLocations).toEqual(original);
    });

    it.each([0, 1, 0, 1])('applies 2D emitter mode %s to main fields and Var fields', mode => {
        const dump = particle2D(true, mode);
        applyParticleInspectorMetadata(dump);
        expect([...gravity, ...radius].map(name => dump.value[name].visible))
            .toEqual([...gravity.map(() => mode === 0), ...radius.map(() => mode === 1)]);
    });

    it('keeps only Custom-independent fields visible when Custom is off', () => {
        const dump = particle2D(false);
        dump.value.file.visible = false;
        applyParticleInspectorMetadata(dump);
        expect(Object.keys(dump.value).filter(name => dump.value[name].visible))
            .toEqual(independent.filter(name => name !== 'file'));
    });

    it('preserves values, paths and defaults even for hidden and readonly fields', () => {
        const { dump } = particle3D(true);
        dump.value.renderer.default = { cpuMaterial: 'default' };
        const original = structuredClone(dump);
        applyParticleInspectorMetadata(dump);
        // Ignore only presentation fields when comparing the full serialized payload.
        const payload = (value: IComponent) => JSON.stringify(value, (key, item) =>
            ['visible', 'readonly', 'enumList'].includes(key) ? undefined : item);
        expect(payload(dump)).toBe(payload(original));
        const twoD = particle2D(false);
        const previous = payload(twoD);
        applyParticleInspectorMetadata(twoD);
        expect(payload(twoD)).toBe(previous);
    });

    it('leaves unknown modes and incomplete enum definitions unchanged', () => {
        const { dump, renderer, shape } = particle3D(false, 99);
        renderer.useGPU.value = 'unknown';
        const original = structuredClone(dump);
        applyParticleInspectorMetadata(dump);
        expect(dump).toEqual(original);
        shape.shapeType.value = 0;
        shape.emitFrom.enumList = [{ name: 'Volume', value: 3 }];
        applyParticleInspectorMetadata(dump);
        expect(shape.emitFrom.enumList).toEqual([{ name: 'Volume', value: 3 }]);
        const twoD = particle2D(true, 99);
        const original2D = structuredClone(twoD);
        applyParticleInspectorMetadata(twoD);
        expect(twoD).toEqual(original2D);
        twoD.value.custom.value = 'unknown';
        twoD.value.emitterMode.value = 0;
        const unknownCustom = structuredClone(twoD);
        applyParticleInspectorMetadata(twoD);
        expect(twoD).toEqual(unknownCustom);
    });

    it('accepts missing fields and null modules without affecting other fields', () => {
        const dump = component('cc.ParticleSystem', { renderer: property(null), shapeModule: property(null) });
        const original = structuredClone(dump);
        applyParticleInspectorMetadata(dump);
        expect(dump).toEqual(original);
        const twoD = component('cc.ParticleSystem2D', { custom: property(true), emitterMode: property(1) });
        expect(() => applyParticleInspectorMetadata(twoD)).not.toThrow();
    });

    it('supports particle subclasses and ignores unrelated components', () => {
        const { dump, renderer } = particle3D();
        dump.type = 'UserParticle';
        const original = structuredClone(dump);
        applyParticleInspectorMetadata(dump);
        expect(dump).toEqual(original);
        dump.extends = ['cc.ParticleSystem', 'cc.Component'];
        applyParticleInspectorMetadata(dump);
        expect(renderer.gpuMaterial.readonly).toBe(true);
    });
});
