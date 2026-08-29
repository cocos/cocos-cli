import { assetManager, director, MeshRenderer, Scene, Terrain, Texture2D } from 'cc';
import { copy, pathExists, readdir, remove } from 'fs-extra';
import { join } from 'path';
import type { ILightFXBakeEvents, ILightFXCancelResult, ILightmapBakeOptions, ILightmapBakeResult, ILightmapBakeService } from '../../common';
import { BaseService, register, Service } from './core';
import { lightFXCoordinator } from './baking/lightfx/baker';
import type { LightFXBakeOutput } from './baking/lightfx/baker';
import { LightmapAssetTransaction } from './baking/lightfx/asset-transaction';
import { createDefaultLightFXSettings } from './baking/lightfx/settings';
import { Rpc } from '../rpc';

@register('LightmapBake')
export class LightmapBakeService extends BaseService<ILightFXBakeEvents> implements ILightmapBakeService {
    async bake(options: ILightmapBakeOptions = {}): Promise<ILightmapBakeResult> {
        const started = Date.now(); const scene = director.getScene() as Scene | null; if (!scene) throw new Error('No scene is currently open.'); const current = await Service.Editor.queryCurrent(); const sceneUrl = ((current as any)?.__identifier__?.assetUrl ?? (current as any)?.assetUrl) as string | undefined; if (!sceneUrl?.endsWith('.scene')) throw new Error('Lightmaps can only be baked in a saved scene asset.');
        const s = createDefaultLightFXSettings('lightmap'); Object.assign(s, { msaa: options.msaa ?? s.msaa, size: options.resolution ?? s.size, filter: options.filter ?? s.filter, highp: options.highp ?? s.highp, giScale: options.giScale ?? s.giScale, giSamples: options.giSamples ?? s.giSamples, giPathLength: options.giPathLength ?? s.giPathLength, aoLevel: options.aoLevel ?? s.aoLevel, aoStrength: options.aoStrength ?? s.aoStrength, aoRadius: options.aoRadius ?? s.aoRadius, aoColor: options.aoColor?.slice(0, 3) ?? s.aoColor, threads: options.threads ?? s.threads }); this.broadcast('lightfx:bake-start', 'lightmap');
        let output: LightFXBakeOutput | undefined;
        let assets: LightmapAssetTransaction | undefined;
        let refreshUrl: string | undefined;
        try {
            output = await lightFXCoordinator.bake(scene, 'lightmap', s, options.timeoutMs ?? 600_000); if (!output.models.length && !output.terrains.length) throw new Error('No bakeable meshes or terrains were found.');
            const assetRoot = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string; const targetDir = join(assetRoot, scene.name, 'lightmap'); const targetUrl = `db://assets/${scene.name}/lightmap`; refreshUrl = `db://assets/${scene.name}`;
            assets = new LightmapAssetTransaction(targetDir, output.workspace); await assets.prepare();
            const textureUrls: string[] = []; const outputFiles = (await readdir(output.outputDir)).filter((f) => f.toLowerCase().endsWith('.png')); for (const file of outputFiles) { await copy(join(output.outputDir, file), join(targetDir, file), { overwrite: true }); textureUrls.push(`${targetUrl}/${file}`); }
            if (!outputFiles.length) throw new Error('LightFX did not produce any lightmap textures.');
            await Rpc.getInstance().request('assetManager', 'refreshAsset', [targetUrl]); const textures = new Map<number, Texture2D>();
            for (const item of [...output.result.meshes, ...output.result.terrains]) { if (textures.has(item.index)) continue; const file = `LFX_Mesh_${String(item.index).padStart(4, '0')}.png`; const terrainFile = `LFX_Terrain_${String(item.index).padStart(4, '0')}.png`; const url = await pathExists(join(targetDir, file)) ? `${targetUrl}/${file}` : `${targetUrl}/${terrainFile}`; const uuid = await this.waitForAsset(url, Math.min(options.timeoutMs ?? 600_000, 60_000)); await this.disableAlphaFix(uuid); textures.set(item.index, await this.loadTexture(`${uuid}@6c48a`)); }
            const modelState = output.models.map((model: any) => ({ model, texture: model.bakeSettings.texture, uv: model.bakeSettings.uvParam.clone() }));
            const terrainState = output.terrains.map((terrain: any) => ({ terrain, infos: (terrain._lightmapInfos ?? []).map((info: any) => info ? ({ texture: info.texture, uv: info.uvParam?.clone?.() ?? { x: info.UOff, y: info.VOff, z: info.UScale, w: info.VScale } }) : null) }));
            const oldHighp = (scene.globals as any).bakedWithHighpLightmap;
            const oldStationary = (scene.globals as any).bakedWithStationaryMainLight;
            const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Bake lightmap' }); try {
                for (const terrain of output.terrains as any[]) if (terrain.lightMapSize > 0) terrain._resetLightmap(true);
                for (const item of output.result.meshes) { const model: any = output.models[item.id]; if (!model) throw new Error(`LightFX returned invalid mesh id: ${item.id}`); model._updateLightmap(textures.get(item.index), item.offset[0], item.offset[1], item.scale[0], item.scale[1]); model.node._dirtyFlags = 1; }
                for (const item of output.result.terrains) { const terrain: any = output.terrains[item.id]; if (!terrain) throw new Error(`LightFX returned invalid terrain id: ${item.id}`); terrain._updateLightmap(item.blockId, textures.get(item.index), item.offset[0], item.offset[1], item.scale[0], item.scale[1]); }
                (scene.globals as any).bakedWithHighpLightmap = s.highp; (scene.globals as any).bakedWithStationaryMainLight = output.stationaryMainLight; await Service.Engine.repaintInEditMode(); if (options.saveScene !== false) await Service.Editor.save({}); await Service.Undo.endRecording(undo);
            } catch (error) {
                for (const item of modelState) item.model._updateLightmap(item.texture, item.uv.x, item.uv.y, item.uv.z, item.uv.w);
                for (const item of terrainState) item.infos.forEach((info: any, blockId: number) => info && item.terrain._updateLightmap(blockId, info.texture, info.uv.x, info.uv.y, info.uv.z, info.uv.w));
                (scene.globals as any).bakedWithHighpLightmap = oldHighp;
                (scene.globals as any).bakedWithStationaryMainLight = oldStationary;
                Service.Undo.cancelRecording(undo); throw error;
            }
            this.broadcast('lightfx:bake-end', 'lightmap'); return { sceneUrl, textureUrls, meshCount: output.result.meshes.length, terrainCount: output.result.terrains.length, durationMs: Date.now() - started };
        } catch (error) { if (assets) { try { await assets.rollback(); if (refreshUrl) await Rpc.getInstance().request('assetManager', 'refreshAsset', [refreshUrl]); } catch (rollbackError) { console.error('[LightFX] Failed to roll back lightmap assets:', rollbackError); } } const message = error instanceof Error ? error.message : String(error); this.broadcast('lightfx:bake-end', 'lightmap', message); throw error; }
        finally { if (output) await remove(output.workspace).catch(() => undefined); }
    }
    async clearBake(options: { saveScene?: boolean; deleteAssets?: boolean } = {}): Promise<{ clearedCount: number }> { const scene: any = director.getScene(); if (!scene) throw new Error('No scene is currently open.'); let count = 0; const visit = (node: any): void => { for (const model of node.getComponents(MeshRenderer) as MeshRenderer[]) { if (model.bakeSettings.texture) { model._updateLightmap(null, 0, 0, 0, 0); count++; } } for (const terrain of node.getComponents(Terrain) as Terrain[]) { const infos: any[] = (terrain as any)._lightmapInfos ?? []; infos.forEach((info, blockId) => { if (info.texture) { terrain._updateLightmap(blockId, null, 0, 0, 0, 0); count++; } }); } node.children.forEach(visit); }; visit(scene); scene.globals.bakedWithHighpLightmap = false; scene.globals.bakedWithStationaryMainLight = false; await Service.Engine.repaintInEditMode(); if (options.saveScene !== false) await Service.Editor.save({}); if (options.deleteAssets) { const root = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string; await remove(join(root, scene.name, 'lightmap')); await Rpc.getInstance().request('assetManager', 'refreshAsset', [`db://assets/${scene.name}`]); } return { clearedCount: count }; }
    cancel(): Promise<ILightFXCancelResult> { return lightFXCoordinator.cancel(); }
    private async waitForAsset(url: string, timeoutMs: number): Promise<string> { const deadline = Date.now() + timeoutMs; do { const uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [url]) as string | null; if (uuid) return uuid; await new Promise((resolve) => setTimeout(resolve, 200)); } while (Date.now() < deadline); throw new Error(`Lightmap texture import timed out: ${url}`); }
    private async disableAlphaFix(uuid: string): Promise<void> { const rpc = Rpc.getInstance(); const meta = await rpc.request('assetManager', 'queryAssetMeta', [uuid]) as any; if (meta?.userData?.fixAlphaTransparencyArtifacts === false) return; if (!meta) throw new Error(`Lightmap texture metadata is unavailable: ${uuid}`); meta.userData ??= {}; meta.userData.fixAlphaTransparencyArtifacts = false; await rpc.request('assetManager', 'saveAssetMeta', [uuid, meta]); }
    private loadTexture(uuid: string): Promise<Texture2D> { return new Promise((resolve, reject) => assetManager.loadAny(uuid, (error, asset: Texture2D) => error ? reject(error) : resolve(asset))); }
}
