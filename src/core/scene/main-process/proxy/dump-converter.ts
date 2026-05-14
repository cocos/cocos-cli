'use strict';

import type {
    INodeInfo,
    INode,
    IComponentInfo,
    IComponent,
    IComponentIdentifier,
    IPrefab,
    IPrefabInfo,
    ITargetOverrideDetail,
    ISceneInfo,
} from '../../common';
import type { IScene } from '../../common/editor/scene';
import type { IPropertyValueType } from '../../@types/public';

export interface IDumpConvertOptions {
    path?: string;
    children?: boolean;
    fullComponents?: boolean;
}

export class DumpConverter {
    static toNode(dump: INode | IScene, options?: IDumpConvertOptions): INodeInfo {
        if ('isScene' in dump && dump.isScene) {
            return DumpConverter.sceneToNode(dump as IScene, options);
        }
        return DumpConverter.nodeToNode(dump as INode, options);
    }

    static toScene(dump: IScene, options?: IDumpConvertOptions): ISceneInfo {
        const d = dump as any;
        const identifier = d.__identifier__ ?? {};
        const children = options?.children ?? true;
        return {
            assetType: identifier.assetType ?? '',
            assetName: identifier.assetName ?? '',
            assetUuid: identifier.assetUuid ?? '',
            assetUrl: identifier.assetUrl ?? '',
            name: dump.name.value as string,
            prefab: DumpConverter.convertPrefab(d.__prefab__),
            children: children
                ? (d.__childNodes__?.map((c: INode) => DumpConverter.toNode(c, options)) ?? [])
                : [],
            components: d.__comps__?.map((c: any) => DumpConverter.toComponentIdentifier(c)) ?? [],
        };
    }

    private static sceneToNode(dump: IScene, options?: IDumpConvertOptions): INodeInfo {
        const d = dump as any;
        const children = options?.children ?? true;
        return {
            nodeId: dump.uuid.value as string,
            path: options?.path || d.__path__ || '/',
            name: dump.name.value as string,
            properties: {
                active: dump.active.value as boolean,
                position: d.position?.value ?? { x: 0, y: 0, z: 0 },
                rotation: d.rotation?.value ? DumpConverter.eulerToQuat(d.rotation.value) : { x: 0, y: 0, z: 0, w: 1 },
                eulerAngles: d.rotation?.value ?? { x: 0, y: 0, z: 0 },
                scale: d.scale?.value ?? { x: 1, y: 1, z: 1 },
                mobility: d.mobility?.value ?? 0,
                layer: d.layer?.value ?? 0,
            },
            children: children
                ? d.__childNodes__?.map((c: INode) => DumpConverter.toNode(c, options))
                : undefined,
            prefab: DumpConverter.convertPrefab(d.__prefab__),
        };
    }

    private static nodeToNode(dump: INode, options?: IDumpConvertOptions): INodeInfo {
        const d = dump as any;
        const children = options?.children ?? true;
        const fullComponents = options?.fullComponents ?? false;
        return {
            nodeId: dump.uuid.value as string,
            path: options?.path || d.__path__ || '',
            name: dump.name.value as string,
            properties: {
                active: dump.active.value as boolean,
                position: dump.position.value,
                rotation: DumpConverter.eulerToQuat(dump.rotation.value),
                eulerAngles: dump.rotation.value,
                scale: dump.scale.value,
                mobility: dump.mobility.value as number,
                layer: dump.layer.value as number,
            },
            components: fullComponents
                ? (dump.__comps__?.map(c => DumpConverter.toComponent(c)) ?? [])
                : (dump.__comps__?.map(c => DumpConverter.toComponentIdentifier(c)) ?? []),
            children: children
                ? d.__childNodes__?.map((c: any) => DumpConverter.toNode(c, options))
                : undefined,
            prefab: DumpConverter.convertPrefab(dump.__prefab__),
        };
    }

    static toComponent(dump: IComponent): IComponentInfo {
        const d = dump as any;
        const properties: { [key: string]: IPropertyValueType } = {};

        if (dump.value && typeof dump.value === 'object') {
            for (const key in dump.value) {
                if (key === 'uuid' || key === 'name' || key === 'enabled') {
                    continue;
                }
                properties[key] = dump.value[key];
            }
        }

        return {
            cid: d.cid || '',
            path: d.__component_path__ || '',
            uuid: (dump.value?.uuid as any)?.value || '',
            name: (dump.value?.name as any)?.value || '',
            type: dump.type || '',
            enabled: (dump.value?.enabled as any)?.value ?? true,
            properties,
            prefab: d.__compPrefab__ ?? null,
        };
    }

    static toComponentIdentifier(dump: IComponent): IComponentIdentifier {
        const d = dump as any;
        return {
            cid: d.cid || '',
            path: d.__component_path__ || '',
            uuid: (dump.value?.uuid as any)?.value || '',
            name: (dump.value?.name as any)?.value || '',
            type: dump.type || '',
            enabled: (dump.value?.enabled as any)?.value ?? true,
        };
    }

    static convertPrefab(prefab?: IPrefab): IPrefabInfo | null {
        if (!prefab) return null;
        const d = prefab as any;
        return {
            asset: d.__asset__ ?? undefined,
            root: d.__root__?.nodeId ? d.__root__ : undefined,
            instance: DumpConverter.convertPrefabInstance(prefab.instance, d.__instance__),
            fileId: prefab.fileId,
            targetOverrides: DumpConverter.convertTargetOverrides(prefab.targetOverrides),
            nestedPrefabInstanceRoots: d.__nested_roots__ ?? [],
        };
    }

    private static convertTargetOverrides(overrides?: IPrefab['targetOverrides']): ITargetOverrideDetail[] {
        if (!overrides) return [];
        return overrides.map(info => {
            const d = info as any;
            return {
                source: d.__source__ ?? null,
                sourceInfo: info.sourceInfo ? { localID: info.sourceInfo } : null,
                propertyPath: info.propertyPath,
                target: d.__target__ ?? null,
                targetInfo: info.targetInfo ? { localID: info.targetInfo } : null,
            };
        });
    }

    private static convertPrefabInstance(instanceDump: any, enriched: any): any {
        if (!instanceDump?.value) return undefined;
        const v = instanceDump.value;
        return {
            fileId: v.fileId?.value ?? '',
            prefabRootNode: enriched?.prefabRootNode ?? undefined,
            mountedChildren: (v.mountedChildren?.value ?? []).map((mc: any, i: number) => ({
                targetInfo: DumpConverter.extractTargetInfo(mc.value?.targetInfo),
                nodes: enriched?.mountedChildren?.[i]?.nodes ?? [],
            })),
            mountedComponents: (v.mountedComponents?.value ?? []).map((mc: any, i: number) => ({
                targetInfo: DumpConverter.extractTargetInfo(mc.value?.targetInfo),
                components: enriched?.mountedComponents?.[i]?.components ?? [],
            })),
            propertyOverrides: (v.propertyOverrides?.value ?? []).map((po: any) => ({
                targetInfo: DumpConverter.extractTargetInfo(po.value?.targetInfo),
                propertyPath: po.value?.propertyPath ?? [],
            })),
            removedComponents: (v.removedComponents?.value ?? []).map((rc: any) => ({
                localID: DumpConverter.extractLocalID(rc),
            })),
        };
    }

    private static extractTargetInfo(prop: any): any {
        if (!prop?.value) return null;
        return { localID: DumpConverter.extractLocalID(prop) };
    }

    private static extractLocalID(prop: any): string[] {
        const localID = prop?.value?.localID;
        if (!localID?.value || !Array.isArray(localID.value)) return [];
        return localID.value.map((item: any) => String(item.value ?? ''));
    }

    static quatToEuler(quat: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number } {
        const { x, y, z, w } = quat;
        const RAD2DEG = 180 / Math.PI;
        const test = x * y + z * w;
        if (test > 0.499999) {
            return { x: 0, y: RAD2DEG * 2 * Math.atan2(x, w), z: 90 };
        }
        if (test < -0.499999) {
            return { x: 0, y: -RAD2DEG * 2 * Math.atan2(x, w), z: -90 };
        }
        const sqx = x * x;
        const sqy = y * y;
        const sqz = z * z;
        return {
            x: RAD2DEG * Math.atan2(2 * x * w - 2 * y * z, 1 - 2 * sqx - 2 * sqz),
            y: RAD2DEG * Math.atan2(2 * y * w - 2 * x * z, 1 - 2 * sqy - 2 * sqz),
            z: RAD2DEG * Math.asin(2 * test),
        };
    }

    private static eulerToQuat(euler: any): { x: number; y: number; z: number; w: number } {
        if (!euler || typeof euler !== 'object') return { x: 0, y: 0, z: 0, w: 1 };
        const DEG2RAD = Math.PI / 180;
        const halfX = (euler.x || 0) * DEG2RAD * 0.5;
        const halfY = (euler.y || 0) * DEG2RAD * 0.5;
        const halfZ = (euler.z || 0) * DEG2RAD * 0.5;
        const cx = Math.cos(halfX), sx = Math.sin(halfX);
        const cy = Math.cos(halfY), sy = Math.sin(halfY);
        const cz = Math.cos(halfZ), sz = Math.sin(halfZ);
        return {
            x: sx * cy * cz + cx * sy * sz,
            y: cx * sy * cz + sx * cy * sz,
            z: cx * cy * sz - sx * sy * cz,
            w: cx * cy * cz - sx * sy * sz,
        };
    }
}
