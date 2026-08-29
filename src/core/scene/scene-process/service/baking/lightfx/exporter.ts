import { DirectionalLight, director, gfx, Light, MeshRenderer, MobilityMode, renderer, Scene, SphereLight, SpotLight, Terrain, Texture2D, Vec3 } from 'cc';
import { basename, join } from 'path';
import { copy, pathExists } from 'fs-extra';
import { Rpc } from '../../../rpc';
import { LightFXBakeTarget, LightFXLight, LightFXMaterial, LightFXMesh, LightFXSettings, LightFXTerrain, LightFXWorld } from './types';

export interface LightFXExport { world: LightFXWorld; models: MeshRenderer[]; terrains: Terrain[]; stationaryMainLight: boolean }

export class LightFXExporter {
    constructor(private readonly textureDir: string, private readonly projectRoot: string) {}

    async export(scene: Scene, target: LightFXBakeTarget, settings: LightFXSettings): Promise<LightFXExport> {
        const world: LightFXWorld = { name: scene.name, settings, meshes: [], terrains: [], lights: [], probes: [], textures: [] };
        const models: MeshRenderer[] = []; const terrains: Terrain[] = [];
        let hasMainLight = false; let stationaryMainLight = false;
        const hdr = director.root?.pipeline.pipelineSceneData.isHDR ?? false;
        const visit = async (node: any): Promise<void> => {
            if (node !== scene && (node.mobility === MobilityMode.Movable || !node.activeInHierarchy || (node._objFlags & (1 << 10)))) return;
            if (node !== scene) {
                const terrain = node.getComponent(Terrain) as Terrain | null;
                if (terrain?.enabled) { world.terrains.push(this.exportTerrain(terrain)); terrains.push(terrain); }
                for (const model of node.getComponents(MeshRenderer) as MeshRenderer[]) {
                    if (!model.enabled) continue; const exported = await this.exportMesh(model, target);
                    if (exported) { world.meshes.push(exported); models.push(model); }
                }
                for (const light of node.getComponents(Light) as Light[]) if (light.enabled) { const exported = this.exportLight(light, hdr); if (exported) { world.lights.push(exported); if (!hasMainLight && light instanceof DirectionalLight) { hasMainLight = true; stationaryMainLight = light.node.mobility === MobilityMode.Stationary; } } }
            }
            for (const child of node.children) await visit(child);
        };
        await visit(scene);
        const exposure = hdr ? renderer.scene.Camera.standardExposureValue : 1;
        for (const light of world.lights) light.color = light.color.map((value) => value * exposure);
        if (scene.globals.lightProbeInfo.data) for (const probe of scene.globals.lightProbeInfo.data.probes) world.probes.push({ position: [probe.position.x, probe.position.y, probe.position.z], normal: [probe.normal.x, probe.normal.y, probe.normal.z] });
        return { world, models, terrains, stationaryMainLight };
    }

    private exportTerrain(terrain: Terrain): LightFXTerrain {
        const p = terrain.node.worldPosition; const info: any = terrain.info;
        return { position: [p.x, p.y, p.z], tileSize: info.tileSize, blockCount: [...info.blockCount], lightmapSize: info.lightMapSize, heightField: (terrain as any).getHeightField() };
    }

    private async exportMesh(model: MeshRenderer, target: LightFXBakeTarget): Promise<LightFXMesh | null> {
        const mesh: any = model.mesh; if (!mesh) return null; const bake: any = model.bakeSettings;
        if (target === 'light-probe' && !bake.bakeToLightProbe) return null;
        if (target === 'lightmap' && !bake.bakeable && !bake.castShadow) return null;
        const out: LightFXMesh = { castShadow: target === 'light-probe' ? true : bake.castShadow, receiveShadow: target === 'lightmap' && bake.receiveShadow, lightmapSize: target === 'lightmap' && bake.bakeable ? bake.lightmapSize : 0, vertices: [], triangles: [], materials: [] };
        const matrix = model.node.worldMatrix; let start = 0;
        for (let primitive = 0; primitive < mesh.struct.primitives.length; primitive++) {
            const positions: any = mesh.readAttribute(primitive, gfx.AttributeName.ATTR_POSITION); const normals: any = mesh.readAttribute(primitive, gfx.AttributeName.ATTR_NORMAL); const indices: any = mesh.readIndices(primitive);
            const uvs: any = mesh.readAttribute(primitive, gfx.AttributeName.ATTR_TEX_COORD); const luvs: any = mesh.readAttribute(primitive, gfx.AttributeName.ATTR_TEX_COORD1);
            if (!positions || !normals || !indices || positions.length !== normals.length) throw new Error(`Mesh has invalid position, normal or index data: ${model.node.name}`);
            if (target === 'lightmap' && out.lightmapSize > 0 && !luvs) throw new Error(`Mesh is missing lightmap UV: ${model.node.name}`);
            for (let i = 0; i < positions.length / 3; i++) {
                const p = new Vec3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); const n = new Vec3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
                Vec3.transformMat4(p, p, matrix); Vec3.transformMat4Normal(n, n, matrix).normalize();
                out.vertices.push({ position: [p.x, p.y, p.z], normal: [n.x, n.y, n.z], uv: uvs ? [uvs[i * 2], uvs[i * 2 + 1]] : [0, 0], lightmapUV: luvs ? [luvs[i * 2], luvs[i * 2 + 1]] : [0, 0] });
            }
            for (let i = 0; i < indices.length; i += 3) out.triangles.push({ indices: [indices[i] + start, indices[i + 1] + start, indices[i + 2] + start], materialId: Math.min(primitive, Math.max(0, model.materials.length - 1)) });
            start = out.vertices.length;
        }
        if (model.materials.length) for (const material of model.materials) out.materials.push(await this.exportMaterial(material));
        else out.materials.push(this.defaultMaterial());
        return out;
    }

    private async exportMaterial(material: any): Promise<LightFXMaterial> {
        const out = this.defaultMaterial(); if (!material) return out;
        const color = material.getProperty('mainColor', 0); if (color) out.diffuse = [color.x, color.y, color.z];
        const emissive = material.getProperty('emissive', 0); if (emissive) out.emissive = [emissive.x, emissive.y, emissive.z];
        this.applyColorScale(out.diffuse, material.getProperty('albedoScale', 0));
        this.applyColorScale(out.emissive, material.getProperty('emissiveScale', 0));
        out.metallic = Number(material.getProperty('metallic', 0) ?? 0.6); out.roughness = Number(material.getProperty('roughness', 0) ?? 0.8); out.alphaCutoff = Number(material.getProperty('alphaThreshold', 0) ?? 0.5);
        out.texture = await this.resolveTexture(material.getProperty('mainTexture', 0) ?? material.getProperty('albedoMap', 0));
        out.pbrMap = await this.resolveTexture(material.getProperty('pbrMap', 0)); out.emissiveMap = await this.resolveTexture(material.getProperty('emissiveMap', 0));
        return out;
    }
    private defaultMaterial(): LightFXMaterial { return { alphaCutoff: 0.5, metallic: 0.6, roughness: 0.8, diffuse: [1, 1, 1], emissive: [0, 0, 0], texture: '', pbrMap: '', emissiveMap: '' }; }
    private applyColorScale(color: number[], scale: Vec3 | number | null): void {
        if (typeof scale === 'number') { color[0] *= scale; color[1] *= scale; color[2] *= scale; }
        else if (scale) { color[0] *= scale.x; color[1] *= scale.y; color[2] *= scale.z; }
    }
    private async resolveTexture(texture: Texture2D | null): Promise<string> {
        const pixelFormat = Texture2D.PixelFormat;
        if (texture && texture.getPixelFormat() !== pixelFormat.RGBA8888 && texture.getPixelFormat() !== pixelFormat.RGB888) return '';
        const image: any = texture?.mipmaps?.[0]; if (!image?._uuid) return '';
        const uuid = String(image._uuid); let source: string | null;
        if (uuid.includes('@')) source = join(this.projectRoot, 'library', uuid.slice(0, 2), `${uuid}${image._native ?? ''}`);
        else source = await Rpc.getInstance().request('assetManager', 'queryPath', [uuid]) as string | null;
        if (!source || !(await pathExists(source))) return '';
        const name = `${uuid.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${basename(source)}`; await copy(source, join(this.textureDir, name)); return name;
    }

    private exportLight(light: Light, hdr: boolean): LightFXLight | null {
        const p = light.node.worldPosition; const d = new Vec3(0, 0, -1); Vec3.transformQuat(d, d, light.node.worldRotation); const c: any = light.color;
        const out: LightFXLight = { type: 2, position: [p.x, p.y, p.z], direction: [d.x, d.y, d.z], color: [c.x, c.y, c.z], size: 0, range: 0, attenuationFalloff: 1, spotInner: 1, spotOuter: .7071, spotFalloff: 1, directScale: light.node.mobility === MobilityMode.Static ? 1 : 0, indirectScale: 1, giEnabled: true, castShadow: (light as any).staticSettings.castShadow, shadowMask: 0 };
        if (light instanceof DirectionalLight) { out.type = 2; out.shadowMask = 1 - light.shadowSaturation; out.color = out.color.map((v) => v * light.illuminance); }
        else if (light instanceof SphereLight) { out.type = 0; out.size = light.size; out.range = light.range; out.color = out.color.map((v) => v * light.luminance * (hdr ? 10_000 : 1)); }
        else if (light instanceof SpotLight) { out.type = 1; out.size = light.size; out.range = light.range; out.spotInner = Math.cos(light.spotAngle / 4 * Math.PI / 180); out.spotOuter = Math.cos(light.spotAngle / 2 * Math.PI / 180); out.color = out.color.map((v) => v * light.luminance * (hdr ? 10_000 : 1)); }
        else return null; return out;
    }
}
