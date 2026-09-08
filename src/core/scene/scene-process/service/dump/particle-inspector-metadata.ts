import type { IProperty } from '../../../@types/public';
import type { IComponent } from '../../../common/component';

type PropertyMap = Record<string, IProperty | undefined>;

// Creator 3.8.8, editor/inspector/components/particle-system.js:
// getShapeTypeEmitFrom(). Keep the Inspector order, not the engine enum order.
const emitFromNames: Record<string, readonly string[]> = {
    Box: ['Volume', 'Shell', 'Edge'],
    Cone: ['Base', 'Shell', 'Volume'],
    Sphere: ['Volume', 'Shell'],
    Hemisphere: ['Volume', 'Shell'],
    Circle: [],
};

// Creator 3.8.8, editor/inspector/components/particle-system-2d.js:
// custom.update() and emitterMode.update(). Var fields are inline children in
// Creator; flat dump consumers need the same visibility on those fields too.
const customIndependentFields = new Set([
    'customMaterial', 'color', 'preview', 'playOnLoad', 'autoRemoveOnFinish', 'file', 'custom',
]);
const gravityFields = [
    'gravity', 'speed', 'speedVar', 'tangentialAccel', 'tangentialAccelVar',
    'radialAccel', 'radialAccelVar', 'rotationIsDir',
];
const radiusFields = [
    'startRadius', 'startRadiusVar', 'endRadius', 'endRadiusVar', 'rotatePerS', 'rotatePerSVar',
];

function fieldsOf(property: IProperty | undefined): PropertyMap | undefined {
    const value = property?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value as PropertyMap;
}

function hide(property: IProperty | undefined): void {
    if (property) {
        property.visible = false;
    }
}

function apply3DMetadata(component: IComponent): void {
    const fields = component.value as PropertyMap;
    const renderer = fieldsOf(fields.renderer);
    const useGPU = renderer?.useGPU?.value;
    if (typeof useGPU === 'boolean') {
        // particle-system.js: Trail / Limit Velocity showflag and useGPU.changeState().
        if (useGPU) {
            hide(fields.trailModule);
            hide(fields.limitVelocityOvertimeModule);
        }
        for (const name of ['cpuMaterial', 'gpuMaterial', 'trailMaterial']) {
            const material = renderer?.[name];
            if (material) {
                material.readonly = Boolean(material.readonly || fields.renderer?.readonly
                    || component.readonly || (name === 'gpuMaterial' ? !useGPU : useGPU));
            }
        }
    }

    const shape = fieldsOf(fields.shapeModule);
    const shapeType = shape?.shapeType;
    const emitFrom = shape?.emitFrom;
    const shapeName = shapeType?.enumList?.find(entry => entry.value === shapeType.value)?.name;
    if (typeof shapeName !== 'string' || !Object.hasOwn(emitFromNames, shapeName) || !emitFrom?.enumList) {
        return;
    }
    const names = emitFromNames[shapeName];
    const options = names.map(name => emitFrom.enumList!.find(entry => entry.name === name));
    // An unfamiliar/incomplete engine enum must not silently lose options.
    if (options.every(option => option !== undefined)) {
        emitFrom.enumList = options.map(option => ({ ...option }));
    }
}

function apply2DMetadata(component: IComponent): void {
    const fields = component.value as PropertyMap;
    const custom = fields.custom?.value;
    if (custom === false) {
        for (const [name, field] of Object.entries(fields)) {
            if (!customIndependentFields.has(name)) {
                hide(field);
            }
        }
    } else if (custom === true) {
        // cc.ParticleSystem2D.EmitterMode: GRAVITY = 0, RADIUS = 1.
        const mode = fields.emitterMode?.value;
        const hiddenFields = mode === 0 ? radiusFields : mode === 1 ? gravityFields : [];
        hiddenFields.forEach(name => hide(fields[name]));
    }
}

/**
 * Add Creator Inspector presentation rules to a freshly encoded component dump.
 * Never change values, shared engine attributes or restore/write permissions:
 * hidden and UI-readonly fields must remain available to Undo snapshots.
 */
export function applyParticleInspectorMetadata(component: IComponent): void {
    if (component.type === 'cc.ParticleSystem' || component.extends?.includes('cc.ParticleSystem')) {
        apply3DMetadata(component);
    } else if (component.type === 'cc.ParticleSystem2D' || component.extends?.includes('cc.ParticleSystem2D')) {
        apply2DMetadata(component);
    }
}
