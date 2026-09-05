import { Scene } from 'cc';
import { encodeLightFXBase64 } from './buffer';
import { encodeLightFXInput } from './format';
import { LightFXExporter, LightFXExport } from './exporter';
import { lightFXBakeHost } from './host';
import { LightFXBakeTarget, LightFXResult, LightFXSettings } from './types';

const INPUT_CHUNK_SIZE = 512 * 1024;

export interface LightFXBakeOutput extends LightFXExport {
    result: LightFXResult;
    operationId: string;
    textureUrls: string[];
}

class LightFXCoordinator {
    private target: LightFXBakeTarget | null = null;

    get activeTarget(): LightFXBakeTarget | null { return this.target; }

    async bake(scene: Scene, target: LightFXBakeTarget, settings: LightFXSettings, timeoutMs: number): Promise<LightFXBakeOutput> {
        if (this.target) throw new Error(`A ${this.target} LightFX bake is already in progress.`);
        this.target = target;
        let operationId: string | undefined;
        try {
            const exported = await new LightFXExporter().export(scene, target, settings);
            ({ operationId } = await lightFXBakeHost.begin({
                target,
                sceneName: scene.name,
                textureSources: exported.textureSources,
                timeoutMs,
            }));
            const input = encodeLightFXInput(exported.world);
            for (let offset = 0; offset < input.length; offset += INPUT_CHUNK_SIZE) {
                await lightFXBakeHost.appendInput({
                    operationId,
                    chunkBase64: encodeLightFXBase64(input.subarray(offset, Math.min(offset + INPUT_CHUNK_SIZE, input.length))),
                });
            }
            const output = await lightFXBakeHost.run({ operationId });
            return { ...exported, result: output.result, textureUrls: output.textureUrls, operationId };
        } catch (error) {
            if (operationId) await lightFXBakeHost.rollback({ operationId }).catch(() => undefined);
            this.target = null;
            throw error;
        }
    }

    async commit(operationId: string): Promise<void> {
        try {
            await lightFXBakeHost.commit({ operationId });
        } finally {
            this.target = null;
        }
    }

    async rollback(operationId: string): Promise<void> {
        try {
            await lightFXBakeHost.rollback({ operationId });
        } finally {
            this.target = null;
        }
    }

    removeLightmapAssets(sceneName: string): Promise<void> {
        return lightFXBakeHost.removeLightmapAssets({ sceneName });
    }

    async cancel(): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }> {
        return lightFXBakeHost.cancel();
    }
}

export const lightFXCoordinator = new LightFXCoordinator();
