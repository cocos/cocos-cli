import { director, MeshRenderer, Scene, Terrain, Texture2D } from 'cc';
import type {
    ILightFXBakeEvents, ILightFXCancelResult, ILightmapBakeOptions,
    ILightmapBakeInfo, ILightmapBakeResult, ILightmapBakeService, ILightmapBakeCapabilities,
} from '../../common';
import { Rpc } from '../rpc';
import { lightFXCoordinator } from './baking/lightfx/baker';
import type { LightFXBakeOutput } from './baking/lightfx/baker';
import { lightFXBakeHost } from './baking/lightfx/host';
import { createDefaultLightFXSettings } from './baking/lightfx/settings';
import { lightFXSceneOperation } from './baking/lightfx/scene-operation';
import { finishSavedLightFXRecording, LightFXResultRetainedError } from './baking/lightfx/saved-recording';
import { BaseService, register, Service } from './core';
import { loadPreviewAsset } from './preview/asset-reload';

interface LightmapBinding {
    target: any;
    blockId?: number;
    texture: Texture2D | null;
    uv: { x: number; y: number; z: number; w: number };
}

@register('LightmapBake')
export class LightmapBakeService extends BaseService<ILightFXBakeEvents> implements ILightmapBakeService {
    async queryCapabilities(): Promise<ILightmapBakeCapabilities> {
        const host = await lightFXBakeHost.queryCapabilities();
        if (host?.sceneTransactionVersion !== 1 || host.lightmapAssetVersion !== 1 || typeof host.busy !== 'boolean') {
            throw new Error('The LightFX host does not support scene transaction and immutable Lightmap asset protocol version 1.');
        }
        return { version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1, assetVersion: 1,
            ...(host.lightmapOutputDirectory === true ? { outputDirectory: true as const } : {}),
            ...(host.diagnosticsVersion === 1 ? { diagnostics: await lightFXCoordinator.queryDiagnostics('lightmap') } : {}),
            ...(host.cancelOwnershipVersion === 1 ? { cancelVersion: 1 as const, cancellable: lightFXCoordinator.canCancel('lightmap') } : {}), busy: host.busy };
    }

    async bake(options: ILightmapBakeOptions = {}): Promise<ILightmapBakeResult> {
        return lightFXSceneOperation.run('lightmap', 'bake', () => this.bakeExclusive(options));
    }

    private async bakeExclusive(options: ILightmapBakeOptions): Promise<ILightmapBakeResult> {
        const started = Date.now();
        const scene = director.getScene() as Scene | null;
        if (!scene) throw new Error('No scene is currently open.');

        const sceneUrl = await this.querySceneUrl();
        const settings = createDefaultLightFXSettings('lightmap');
        Object.assign(settings, {
            msaa: options.msaa ?? settings.msaa,
            size: options.resolution ?? settings.size,
            filter: options.filter ?? settings.filter,
            highp: options.highp ?? settings.highp,
            giScale: options.giScale ?? settings.giScale,
            giSamples: options.giSamples ?? settings.giSamples,
            giPathLength: options.giPathLength ?? settings.giPathLength,
            aoLevel: options.aoLevel ?? settings.aoLevel,
            aoStrength: options.aoStrength ?? settings.aoStrength,
            aoRadius: options.aoRadius ?? settings.aoRadius,
            aoColor: options.aoColor?.slice(0, 3) ?? settings.aoColor,
            threads: options.threads ?? settings.threads,
        });

        const timeoutMs = options.timeoutMs ?? 600_000;
        let output: LightFXBakeOutput | undefined;
        let nativeCommitted = false;
        this.broadcast('lightfx:bake-start', 'lightmap');
        try {
            output = await lightFXCoordinator.bake(scene, 'lightmap', settings, timeoutMs, options.outputUrl);
            if (!output.models.length && !output.terrains.length) {
                throw new Error('No bakeable meshes or terrains were found.');
            }

            const targetUrl = `db://assets/${scene.name}/lightmap`;
            const textures = await this.loadOutputTextures(output, targetUrl, timeoutMs);
            // No scene/history/disk reference may precede the host's decision to retain assets.
            // An unconfirmed commit can leave an orphan version, never a dangling scene binding.
            await lightFXCoordinator.commit(output.operationId);
            nativeCommitted = true;
            const previousBindings = this.snapshotBindings(output);
            const previousHighp = (scene.globals as any).bakedWithHighpLightmap;
            const previousStationary = (scene.globals as any).bakedWithStationaryMainLight;
            // Scene recordings do not recursively capture child components.
            // Keep the flags last, after restoring each affected result binding.
            const targets = [...new Set([...output.models, ...output.terrains].map(component => component.uuid)), scene.uuid];
            const undo = Service.Undo.beginRecording(targets, { label: 'Bake lightmap' });
            try {
                this.applyBakeResult(output, textures);
                (scene.globals as any).bakedWithHighpLightmap = settings.highp;
                (scene.globals as any).bakedWithStationaryMainLight = output.stationaryMainLight;
                await Service.Engine.repaintInEditMode();
                await finishSavedLightFXRecording(Service.Undo, undo,
                    options.saveScene !== false ? () => Service.Editor.save({}) : undefined);
            } catch (error) {
                if (error instanceof LightFXResultRetainedError) throw error;
                this.restoreBindings(previousBindings);
                (scene.globals as any).bakedWithHighpLightmap = previousHighp;
                (scene.globals as any).bakedWithStationaryMainLight = previousStationary;
                Service.Undo.cancelRecording(undo);
                throw error;
            }

            this.broadcast('lightfx:bake-end', 'lightmap');
            return {
                sceneUrl,
                textureUrls: output.textureUrls,
                meshCount: output.result.meshes.length,
                terrainCount: output.result.terrains.length,
                durationMs: Date.now() - started,
                diagnostics: await lightFXCoordinator.queryDiagnostics?.('lightmap'),
            };
        } catch (error) {
            if (output && !nativeCommitted) await lightFXCoordinator.rollback(output.operationId).catch((rollbackError) => {
                console.error('[LightFX] Failed to roll back lightmap assets:', rollbackError);
            });
            this.broadcast('lightfx:bake-end', 'lightmap', this.errorMessage(error));
            throw error;
        }
    }

    async queryBakeInfo(): Promise<ILightmapBakeInfo> {
        const scene = director.getScene() as Scene | null;
        if (!scene) throw new Error('No scene is currently open.');

        const textureUuids = new Set<string>();
        let meshCount = 0;
        let terrainCount = 0;
        const addTexture = (texture: any): boolean => {
            const uuid = texture?.uuid ?? texture?._uuid;
            if (typeof uuid !== 'string' || !uuid) return false;
            textureUuids.add(uuid);
            return true;
        };
        const visit = (node: any): void => {
            for (const model of node.getComponents(MeshRenderer) as any[]) {
                if (addTexture(model.bakeSettings?.texture)) meshCount += 1;
            }
            for (const terrain of node.getComponents(Terrain) as any[]) {
                let hasLightmap = false;
                for (const info of (terrain._lightmapInfos ?? []) as any[]) {
                    hasLightmap = addTexture(info?.texture) || hasLightmap;
                }
                if (hasLightmap) terrainCount += 1;
            }
            node.children.forEach(visit);
        };
        visit(scene);

        const assetInfo = await lightFXBakeHost.queryLightmapTextureInfo({
            uuids: [...textureUuids],
        });
        return {
            sceneUrl: await this.querySceneUrl(),
            baked: meshCount > 0 || terrainCount > 0,
            meshCount,
            terrainCount,
            highp: Boolean((scene.globals as any).bakedWithHighpLightmap),
            stationaryMainLight: Boolean((scene.globals as any).bakedWithStationaryMainLight),
            ...assetInfo,
        };
    }

    async clearBake(options: { saveScene?: boolean; deleteAssets?: boolean } = {}): Promise<{ clearedCount: number }> {
        return lightFXSceneOperation.run('lightmap', 'clear', () => this.clearBakeExclusive(options));
    }

    private async clearBakeExclusive(options: { saveScene?: boolean; deleteAssets?: boolean }): Promise<{ clearedCount: number }> {
        const scene = director.getScene() as Scene | null;
        if (!scene) throw new Error('No scene is currently open.');

        const bindings = this.snapshotSceneBindings(scene);
        const previousHighp = (scene.globals as any).bakedWithHighpLightmap;
        const previousStationary = (scene.globals as any).bakedWithStationaryMainLight;
        const targets = [...new Set(bindings.map(binding => binding.target.uuid as string)), scene.uuid];
        const undo = Service.Undo.beginRecording(targets, { label: 'Clear lightmap' });
        try {
            this.clearBindings(bindings);
            (scene.globals as any).bakedWithHighpLightmap = false;
            (scene.globals as any).bakedWithStationaryMainLight = false;
            await Service.Engine.repaintInEditMode();
            await finishSavedLightFXRecording(Service.Undo, undo,
                options.saveScene !== false ? () => Service.Editor.save({}) : undefined);
        } catch (error) {
            if (error instanceof LightFXResultRetainedError) throw error;
            Service.Undo.cancelRecording(undo);
            this.restoreBindings(bindings);
            (scene.globals as any).bakedWithHighpLightmap = previousHighp;
            (scene.globals as any).bakedWithStationaryMainLight = previousStationary;
            await Service.Engine.repaintInEditMode();
            throw error;
        }

        if (options.deleteAssets) {
            await lightFXCoordinator.removeLightmapAssets(scene.name);
        }
        return { clearedCount: bindings.length };
    }

    cancel(): Promise<ILightFXCancelResult> {
        return lightFXCoordinator.cancel('lightmap');
    }

    private async querySceneUrl(): Promise<string> {
        const current = await Service.Editor.queryCurrent();
        const sceneUrl = ((current as any)?.__identifier__?.assetUrl ?? (current as any)?.assetUrl) as string | undefined;
        if (!sceneUrl?.endsWith('.scene')) throw new Error('Lightmaps can only be baked in a saved scene asset.');
        return sceneUrl;
    }

    private async loadOutputTextures(
        output: LightFXBakeOutput,
        targetUrl: string,
        timeoutMs: number,
    ): Promise<Map<string, Texture2D>> {
        const textures = new Map<string, Texture2D>();
        for (const item of output.result.meshes) {
            await this.loadIndexedTexture(textures, 'mesh', item.index, output.textureUrls, targetUrl, timeoutMs);
        }
        for (const item of output.result.terrains) {
            await this.loadIndexedTexture(textures, 'terrain', item.index, output.textureUrls, targetUrl, timeoutMs);
        }
        return textures;
    }

    private async loadIndexedTexture(
        textures: Map<string, Texture2D>, kind: 'mesh' | 'terrain', index: number,
        textureUrls: readonly string[], targetUrl: string, timeoutMs: number,
    ): Promise<void> {
        const key = `${kind}:${index}`;
        if (textures.has(key)) return;
        const prefix = kind === 'mesh' ? 'Mesh' : 'Terrain';
        const file = `LFX_${prefix}_${String(index).padStart(4, '0')}.png`;
        const textureUrl = textureUrls.find((url) => url === `${targetUrl}/${file}` || url.endsWith(`/${file}`));
        if (!textureUrl) throw new Error(`LightFX did not produce the expected lightmap texture: ${file}`);
        const uuid = await this.waitForAsset(textureUrl, Math.min(timeoutMs, 60_000));
        textures.set(key, await this.loadTexture(`${uuid}@6c48a`, timeoutMs));
    }

    private applyBakeResult(output: LightFXBakeOutput, textures: Map<string, Texture2D>): void {
        for (const terrain of output.terrains as any[]) {
            if (terrain.lightMapSize > 0) terrain._resetLightmap(true);
        }
        for (const item of output.result.meshes) {
            const model: any = output.models[item.id];
            if (!model) throw new Error(`LightFX returned invalid mesh id: ${item.id}`);
            model._updateLightmap(
                textures.get(`mesh:${item.index}`),
                item.offset[0], item.offset[1], item.scale[0], item.scale[1],
            );
            model.node._dirtyFlags = 1;
        }
        for (const item of output.result.terrains) {
            const terrain: any = output.terrains[item.id];
            if (!terrain) throw new Error(`LightFX returned invalid terrain id: ${item.id}`);
            terrain._updateLightmap(
                item.blockId, textures.get(`terrain:${item.index}`),
                item.offset[0], item.offset[1], item.scale[0], item.scale[1],
            );
        }
    }

    private snapshotBindings(output: LightFXBakeOutput): LightmapBinding[] {
        return [
            ...output.models.map((model: any) => ({
                target: model,
                texture: model.bakeSettings.texture,
                uv: model.bakeSettings.uvParam.clone(),
            })),
            ...this.snapshotTerrainBindings(output.terrains),
        ];
    }

    private snapshotSceneBindings(scene: Scene): LightmapBinding[] {
        const bindings: LightmapBinding[] = [];
        const visit = (node: any): void => {
            for (const model of node.getComponents(MeshRenderer) as any[]) {
                if (model.bakeSettings.texture) {
                    bindings.push({
                        target: model,
                        texture: model.bakeSettings.texture,
                        uv: model.bakeSettings.uvParam.clone(),
                    });
                }
            }
            bindings.push(...this.snapshotTerrainBindings(node.getComponents(Terrain)));
            node.children.forEach(visit);
        };
        visit(scene);
        return bindings;
    }

    private snapshotTerrainBindings(terrains: readonly any[]): LightmapBinding[] {
        const bindings: LightmapBinding[] = [];
        for (const terrain of terrains) {
            ((terrain._lightmapInfos ?? []) as any[]).forEach((info, blockId) => {
                if (!info?.texture) return;
                bindings.push({
                    target: terrain,
                    blockId,
                    texture: info.texture,
                    uv: info.uvParam?.clone?.() ?? { x: info.UOff, y: info.VOff, z: info.UScale, w: info.VScale },
                });
            });
        }
        return bindings;
    }

    private clearBindings(bindings: LightmapBinding[]): void {
        for (const binding of bindings) {
            if (binding.blockId === undefined) binding.target._updateLightmap(null, 0, 0, 0, 0);
            else binding.target._updateLightmap(binding.blockId, null, 0, 0, 0, 0);
        }
    }

    private restoreBindings(bindings: LightmapBinding[]): void {
        for (const binding of bindings) {
            const { x, y, z, w } = binding.uv;
            if (binding.blockId === undefined) binding.target._updateLightmap(binding.texture, x, y, z, w);
            else binding.target._updateLightmap(binding.blockId, binding.texture, x, y, z, w);
        }
    }

    private async waitForAsset(url: string, timeoutMs: number): Promise<string> {
        const deadline = Date.now() + timeoutMs;
        do {
            const uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [url]) as string | null;
            if (uuid) return uuid;
            await new Promise((resolve) => setTimeout(resolve, 200));
        } while (Date.now() < deadline);
        throw new Error(`Lightmap texture import timed out: ${url}`);
    }

    private loadTexture(uuid: string, timeoutMs: number): Promise<Texture2D> {
        return loadPreviewAsset<Texture2D>(uuid, 'lightmap texture', {
            reloadAsset: true,
            timeoutMs,
        });
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
