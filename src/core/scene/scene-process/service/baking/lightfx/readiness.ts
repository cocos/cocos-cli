import { gfx, MeshRenderer, MobilityMode, Scene, SkinnedMeshRenderer, Terrain, type Node } from 'cc';
import type { ILightmapReadiness, LightmapObjectIssue } from '../../../../common/lightfx-bake';

/** UV presence alone is insufficient: truncated or non-finite attributes cannot be exported safely. */
export function validLightmapUV(uv: ArrayLike<number> | null, vertexCount: number): boolean {
    if (!uv || !Number.isInteger(vertexCount) || vertexCount <= 0 || uv.length !== vertexCount * 2) { return false; }
    for (let index = 0; index < uv.length; index++) {
        if (!Number.isFinite(uv[index])) { return false; }
    }
    return true;
}

/** Mirrors exporter participation without exporting geometry, resolving textures, or mutating a scene. */
export function queryLightmapReadiness(scene: Scene): ILightmapReadiness {
    const objects: ILightmapReadiness['objects'] = [];
    const visit = (node: Node, inherited: LightmapObjectIssue[]) => {
        // Gizmo/controllers live below the scene but are not user bake candidates.
        if (node !== scene && (node._objFlags & (1 << 10))) { return; }
        const excluded = [...inherited];
        if (node !== scene) {
            if (!node.activeInHierarchy) { excluded.push('inactive'); }
            if (node.mobility === MobilityMode.Movable) { excluded.push('movable'); }
            for (const model of node.getComponents(MeshRenderer)) {
                const issues = [...new Set(excluded)];
                if (!model.enabled) { issues.push('disabled'); }
                const settings = model.bakeSettings;
                if (!settings.bakeable && !settings.castShadow) { issues.push('not-participating'); }
                if (!model.mesh) { issues.push('missing-mesh'); }
                const participates = !issues.length;
                const receivesLightmap = participates && settings.bakeable && settings.lightmapSize > 0;
                if (receivesLightmap && model.mesh) {
                    for (let primitive = 0; primitive < model.mesh.struct.primitives.length; primitive++) {
                        const positions = model.mesh.readAttribute(primitive, gfx.AttributeName.ATTR_POSITION);
                        const uv = model.mesh.readAttribute(primitive, gfx.AttributeName.ATTR_TEX_COORD1);
                        if (!validLightmapUV(uv, (positions?.length ?? 0) / 3)) { issues.push('invalid-uv1'); break; }
                    }
                }
                if (participates) {
                    if (model instanceof SkinnedMeshRenderer) { issues.push('skinned-static-pose'); }
                    issues.push('material-approximation');
                }
                objects.push({ componentUuid: model.uuid, nodeName: node.name, kind: 'mesh', receivesLightmap,
                    castsShadow: participates && settings.castShadow, lightmapSize: settings.lightmapSize, issues });
            }
            for (const terrain of node.getComponents(Terrain)) {
                const issues = [...new Set(excluded)];
                if (!terrain.enabled) { issues.push('disabled'); }
                const participates = !issues.length;
                if (participates) { issues.push('terrain-translation-only'); }
                objects.push({ componentUuid: terrain.uuid, nodeName: node.name, kind: 'terrain',
                    receivesLightmap: participates && terrain.lightMapSize > 0, castsShadow: participates,
                    lightmapSize: terrain.lightMapSize, issues });
            }
        }
        for (const child of node.children) { visit(child, excluded); }
    };
    visit(scene, []);
    return { version: 1, objects };
}
