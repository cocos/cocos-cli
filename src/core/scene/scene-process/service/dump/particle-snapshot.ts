import type { Material, ParticleSystem } from 'cc';
import { builtinResMgr } from 'cc';
import type { IProperty } from '../../../@types/public';
import { COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS } from './restore-policy';

type RestoreProperty = (target: object, path: string, dump: IProperty) => Promise<unknown>;

/** Cocos 3.8 stores both modes' materials, but both public setters change the active material. */
interface ParticleRendererState {
    _cpuMaterial: Material | null;
    _gpuMaterial: Material | null;
    useGPU: boolean;
    particleMaterial: Material | null;
    trailMaterial: Material | null;
}

const rendererMaterialKeys = new Set([
    'cpuMaterial', '_cpuMaterial', 'gpuMaterial', '_gpuMaterial',
    'particleMaterial', 'trailMaterial', 'useGPU', '_useGPU',
]);

/**
 * Restore particle materials as one mode-aware operation. Replaying the hidden and public
 * aliases independently can destroy the CPU material when the unused GPU material is null.
 * Asset decoding finishes before mutating the live renderer; normal fields still use decodePatch.
 */
export async function restoreParticleSystemSnapshot(
    component: ParticleSystem,
    dump: IProperty,
    restore: RestoreProperty,
): Promise<void> {
    const properties = dump.value as Record<string, IProperty>;
    const rendererDump = properties.renderer;
    const fields = rendererDump.value as Record<string, IProperty>;
    const renderer = component.renderer as unknown as ParticleRendererState;
    const targetGPU = Boolean((fields.useGPU ?? fields._useGPU)?.value ?? renderer.useGPU);

    async function material(property: IProperty | undefined, fallback: Material | null): Promise<Material | null> {
        if (!property) {
            return fallback;
        }
        const holder = { value: null as Material | null };
        await restore(holder, 'value', property);
        if (holder.value && holder.value.passes.length === 0) {
            throw new Error(`Cannot restore particle material without render passes: ${holder.value.uuid}`);
        }
        return holder.value;
    }

    const [cpuMaterial, gpuMaterial] = await Promise.all([
        material(fields.cpuMaterial ?? fields._cpuMaterial, renderer._cpuMaterial),
        material(fields.gpuMaterial ?? fields._gpuMaterial, renderer._gpuMaterial),
    ]);
    // particleMaterial is the effective material, including the engine's default fallback.
    const activeMaterial = await material(fields.particleMaterial, targetGPU ? gpuMaterial : cpuMaterial);
    function defaultMaterial(name: string): Material {
        const value = builtinResMgr.get<Material>(name);
        if (!value?.passes.length) {
            throw new Error(`Cannot restore particle default material: ${name}`);
        }
        return value;
    }
    // A fresh component's Reset dump has null materials. Cocos 3.8's renderer
    // destroys the live material instance when assigned null, then reuses that
    // same destroyed instance through its _defaultMat cache. Assign the built-in
    // asset explicitly so the renderer can create a valid instance instead.
    const effectiveMaterial = activeMaterial ?? defaultMaterial(targetGPU ? 'default-particle-gpu-material' : 'default-particle-material');
    const cpuFallback = targetGPU ? cpuMaterial ?? defaultMaterial('default-particle-material') : effectiveMaterial;
    const trailMaterial = fields.trailMaterial
        ? await material(fields.trailMaterial, null) ?? defaultMaterial('default-trail-material')
        : undefined;

    // Cache both modes before switching processor. Never set _useGPU directly: its setter
    // must rebuild the processor when Undo/Redo crosses CPU/GPU modes.
    renderer._cpuMaterial = cpuMaterial;
    renderer._gpuMaterial = gpuMaterial;
    renderer.useGPU = targetGPU;
    renderer.particleMaterial = renderer.useGPU === targetGPU
        ? effectiveMaterial
        : cpuFallback;
    // Restore the Trail asset before enabling its module. Its default instance
    // cache has the same null-material lifetime constraint as the main renderer.
    if (trailMaterial !== undefined) {
        renderer.trailMaterial = trailMaterial;
    }

    for (const [key, property] of Object.entries(properties)) {
        if (COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS.includes(key as typeof COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS[number])
            || key === 'renderer' || key === 'sharedMaterials' || key === '_materials') {
            continue;
        }
        // The private/public module aliases refer to the same live object. A
        // private null from a fresh dump must not remove its processor binding
        // before the public default fields are restored (notably Trail.onInit).
        if (key.startsWith('_') && key.endsWith('Module') && properties[key.slice(1)]?.value) {
            continue;
        }
        await restore(component, key, property);
    }
    for (const [key, property] of Object.entries(fields)) {
        if (!rendererMaterialKeys.has(key)) {
            await restore(component, `renderer.${key}`, property);
        }
    }
}
