import type { Material, ParticleSystem } from 'cc';
import type { IProperty } from '../../../@types/public';
import { COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS } from './restore-policy';

type RestoreProperty = (target: object, path: string, dump: IProperty) => Promise<unknown>;

/** Cocos 3.8 stores both modes' materials, but both public setters change the active material. */
interface ParticleRendererState {
    _cpuMaterial: Material | null;
    _gpuMaterial: Material | null;
    useGPU: boolean;
    particleMaterial: Material | null;
}

const rendererMaterialKeys = new Set([
    'cpuMaterial', '_cpuMaterial', 'gpuMaterial', '_gpuMaterial',
    'particleMaterial', 'useGPU', '_useGPU',
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

    // Cache both modes before switching processor. Never set _useGPU directly: its setter
    // must rebuild the processor when Undo/Redo crosses CPU/GPU modes.
    renderer._cpuMaterial = cpuMaterial;
    renderer._gpuMaterial = gpuMaterial;
    renderer.useGPU = targetGPU;
    renderer.particleMaterial = renderer.useGPU === targetGPU
        ? activeMaterial
        : renderer.useGPU ? gpuMaterial : cpuMaterial;

    for (const [key, property] of Object.entries(properties)) {
        if (COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS.includes(key as typeof COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS[number])
            || key === 'renderer' || key === 'sharedMaterials' || key === '_materials') {
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
