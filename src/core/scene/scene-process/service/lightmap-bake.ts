import { assetManager, director, MeshRenderer, Scene, Terrain, Texture2D } from 'cc';
import { copy, readdir, remove } from 'fs-extra';
import { join } from 'path';
import type {
    ILightFXBakeEvents, ILightFXCancelResult, ILightmapBakeOptions,
    ILightmapBakeResult, ILightmapBakeService,
} from '../../common';
import { Rpc } from '../rpc';
import { LightmapAssetTransaction } from './baking/lightfx/asset-transaction';
import { lightFXCoordinator } from './baking/lightfx/baker';
import type { LightFXBakeOutput } from './baking/lightfx/baker';
import { createDefaultLightFXSettings } from './baking/lightfx/settings';
import { BaseService, register, Service } from './core';

interface LightmapBinding {
    target: any;
    blockId?: number;
    texture: Texture2D | null;
    uv: { x: number; y: number; z: number; w: number };
}

@register('LightmapBake')
export class LightmapBakeService extends BaseService<ILightFXBakeEvents> implements ILightmapBakeService {
    async bake(options: ILightmapBakeOptions = {}): Promise<ILightmapBakeResult> {
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
        let assets: LightmapAssetTransaction | undefined;
        let refreshUrl: string | undefined;
        this.broadcast('lightfx:bake-start', 'lightmap');
        try {
            output = await lightFXCoordinator.bake(scene, 'lightmap', settings, timeoutMs);
            if (!output.models.length && !output.terrains.length) {
                throw new Error('No bakeable meshes or terrains were found.');
            }

            const assetRoot = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string;
            const targetDir = join(assetRoot, scene.name, 'lightmap');
            const targetUrl = `db://assets/${scene.name}/lightmap`;
            refreshUrl = `db://assets/${scene.name}`;
            assets = new LightmapAssetTransaction(targetDir, output.workspace);
            await assets.prepare();

            const textureUrls = await this.importOutputTextures(output, assets, targetDir, targetUrl);
            const textures = await this.loadOutputTextures(output, targetUrl, timeoutMs);
            const previousBindings = this.snapshotBindings(output);
            const previousHighp = (scene.globals as any).bakedWithHighpLightmap;
            const previousStationary = (scene.globals as any).bakedWithStationaryMainLight;
            const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Bake lightmap' });
            try {
                this.applyBakeResult(output, textures);
                (scene.globals as any).bakedWithHighpLightmap = settings.highp;
                (scene.globals as any).bakedWithStationaryMainLight = output.stationaryMainLight;
                await Service.Engine.repaintInEditMode();
                if (options.saveScene !== false) await Service.Editor.save({});
                await Service.Undo.endRecording(undo);
            } catch (error) {
                this.restoreBindings(previousBindings);
                (scene.globals as any).bakedWithHighpLightmap = previousHighp;
                (scene.globals as any).bakedWithStationaryMainLight = previousStationary;
                Service.Undo.cancelRecording(undo);
                throw error;
            }

            this.broadcast('lightfx:bake-end', 'lightmap');
            return {
                sceneUrl,
                textureUrls,
                meshCount: output.result.meshes.length,
                terrainCount: output.result.terrains.length,
                durationMs: Date.now() - started,
            };
        } catch (error) {
            if (assets) {
                try {
                    await assets.rollback();
                    if (refreshUrl) await Rpc.getInstance().request('assetManager', 'refreshAsset', [refreshUrl]);
                } catch (rollbackError) {
                    console.error('[LightFX] Failed to roll back lightmap assets:', rollbackError);
                }
            }
            this.broadcast('lightfx:bake-end', 'lightmap', this.errorMessage(error));
            throw error;
        } finally {
            if (output) await remove(output.workspace).catch(() => undefined);
        }
    }

    async clearBake(options: { saveScene?: boolean; deleteAssets?: boolean } = {}): Promise<{ clearedCount: number }> {
        const scene = director.getScene() as Scene | null;
        if (!scene) throw new Error('No scene is currently open.');

        const bindings = this.snapshotSceneBindings(scene);
        const previousHighp = (scene.globals as any).bakedWithHighpLightmap;
        const previousStationary = (scene.globals as any).bakedWithStationaryMainLight;
        const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Clear lightmap' });
        try {
            this.clearBindings(bindings);
            (scene.globals as any).bakedWithHighpLightmap = false;
            (scene.globals as any).bakedWithStationaryMainLight = false;
            await Service.Engine.repaintInEditMode();
            if (options.saveScene !== false) await Service.Editor.save({});
            await Service.Undo.endRecording(undo);
        } catch (error) {
            Service.Undo.cancelRecording(undo);
            this.restoreBindings(bindings);
            (scene.globals as any).bakedWithHighpLightmap = previousHighp;
            (scene.globals as any).bakedWithStationaryMainLight = previousStationary;
            await Service.Engine.repaintInEditMode();
            throw error;
        }

        if (options.deleteAssets) {
            const root = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string;
            await remove(join(root, scene.name, 'lightmap'));
            await Rpc.getInstance().request('assetManager', 'refreshAsset', [`db://assets/${scene.name}`]);
        }
        return { clearedCount: bindings.length };
    }

    cancel(): Promise<ILightFXCancelResult> {
        return lightFXCoordinator.cancel();
    }

    private async querySceneUrl(): Promise<string> {
        const current = await Service.Editor.queryCurrent();
        const sceneUrl = ((current as any)?.__identifier__?.assetUrl ?? (current as any)?.assetUrl) as string | undefined;
        if (!sceneUrl?.endsWith('.scene')) throw new Error('Lightmaps can only be baked in a saved scene asset.');
        return sceneUrl;
    }

    private async importOutputTextures(
        output: LightFXBakeOutput,
        assets: LightmapAssetTransaction,
        targetDir: string,
        targetUrl: string,
    ): Promise<string[]> {
        const files = (await readdir(output.outputDir)).filter((file) => file.toLowerCase().endsWith('.png'));
        if (!files.length) throw new Error('LightFX did not produce any lightmap textures.');
        for (const file of files) {
            await copy(join(output.outputDir, file), join(targetDir, file), { overwrite: true });
            await assets.preserveMeta(file);
        }
        await Rpc.getInstance().request('assetManager', 'refreshAsset', [targetUrl]);
        return files.map((file) => `${targetUrl}/${file}`);
    }

    private async loadOutputTextures(
        output: LightFXBakeOutput,
        targetUrl: string,
        timeoutMs: number,
    ): Promise<Map<string, Texture2D>> {
        const textures = new Map<string, Texture2D>();
        for (const item of output.result.meshes) {
            await this.loadIndexedTexture(textures, 'mesh', item.index, targetUrl, timeoutMs);
        }
        for (const item of output.result.terrains) {
            await this.loadIndexedTexture(textures, 'terrain', item.index, targetUrl, timeoutMs);
        }
        return textures;
    }

    private async loadIndexedTexture(
        textures: Map<string, Texture2D>, kind: 'mesh' | 'terrain', index: number,
        targetUrl: string, timeoutMs: number,
    ): Promise<void> {
        const key = `${kind}:${index}`;
        if (textures.has(key)) return;
        const prefix = kind === 'mesh' ? 'Mesh' : 'Terrain';
        const file = `LFX_${prefix}_${String(index).padStart(4, '0')}.png`;
        const uuid = await this.waitForAsset(`${targetUrl}/${file}`, Math.min(timeoutMs, 60_000));
        await this.disableAlphaFix(uuid);
        textures.set(key, await this.loadTexture(`${uuid}@6c48a`));
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

    private async disableAlphaFix(uuid: string): Promise<void> {
        const rpc = Rpc.getInstance();
        const meta = await rpc.request('assetManager', 'queryAssetMeta', [uuid]) as any;
        if (meta?.userData?.fixAlphaTransparencyArtifacts === false) return;
        if (!meta) throw new Error(`Lightmap texture metadata is unavailable: ${uuid}`);
        meta.userData ??= {};
        meta.userData.fixAlphaTransparencyArtifacts = false;
        await rpc.request('assetManager', 'saveAssetMeta', [uuid, meta]);
    }

    private loadTexture(uuid: string): Promise<Texture2D> {
        return new Promise((resolve, reject) => {
            assetManager.loadAny(uuid, (error, asset: Texture2D) => error ? reject(error) : resolve(asset));
        });
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
