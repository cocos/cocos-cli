import { Scene } from 'cc';
import { encodeLightFXBase64 } from './buffer';
import { encodeLightFXInput } from './format';
import { LightFXExporter, LightFXExport } from './exporter';
import { lightFXBakeHost } from './host';
import { lightFXSceneOperation } from './scene-operation';
import { LightFXBakeTarget, LightFXResult, LightFXSettings } from './types';
import type { ICancelLightFXOperationOptions } from '../../../../common/lightfx-host';

const INPUT_CHUNK_SIZE = 512 * 1024;

export interface LightFXBakeOutput extends LightFXExport {
    result: LightFXResult;
    operationId: string;
    textureUrls: string[];
}

export class LightFXCoordinator {
    private target: LightFXBakeTarget | null = null;
    private operation: ICancelLightFXOperationOptions | null = null;

    get activeTarget(): LightFXBakeTarget | null { return this.target; }

    canCancel(target: LightFXBakeTarget): boolean { return this.operation?.target === target; }

    async bake(scene: Scene, target: LightFXBakeTarget, settings: LightFXSettings, timeoutMs: number): Promise<LightFXBakeOutput> {
        if (this.target) throw new Error(`A ${this.target} LightFX bake is already in progress.`);
        this.target = target;
        let operationId: string | undefined;
        try {
            const exported = await new LightFXExporter().export(scene, target, settings);
            const transactionId = lightFXSceneOperation.hostTransactionId;
            ({ operationId } = await lightFXBakeHost.begin({
                transactionId,
                target,
                sceneName: scene.name,
                textureSources: exported.textureSources,
                timeoutMs,
            }));
            this.operation = { operationId, transactionId, target };
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
            this.operation = null;
            throw error;
        }
    }

    async commit(operationId: string): Promise<void> {
        try {
            await lightFXBakeHost.commit({ operationId });
        } finally {
            this.target = null;
            this.operation = null;
        }
    }

    async rollback(operationId: string): Promise<void> {
        try {
            await lightFXBakeHost.rollback({ operationId });
        } finally {
            this.target = null;
            this.operation = null;
        }
    }

    removeLightmapAssets(sceneName: string): Promise<void> {
        return lightFXBakeHost.removeLightmapAssets({ sceneName, transactionId: lightFXSceneOperation.hostTransactionId });
    }

    async cancel(target: LightFXBakeTarget): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }> {
        const operation = this.operation;
        if (!operation || operation.target !== target) return { cancelled: false, target: null };
        const capabilities = await lightFXBakeHost.queryCapabilities();
        if (capabilities?.cancelOwnershipVersion !== 1) {
            throw new Error('LightFX cancellation requires host ownership protocol version 1.');
        }
        // Capture before the handshake; neither a late response nor a newer bake may retarget it.
        return lightFXBakeHost.cancel(operation);
    }
}

export const lightFXCoordinator = new LightFXCoordinator();
