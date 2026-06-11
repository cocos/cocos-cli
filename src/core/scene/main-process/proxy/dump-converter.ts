'use strict';

import type {
    INodeInfo,
    INodeIdentifier,
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
        return {
            assetType: identifier.assetType ?? '',
            assetName: identifier.assetName ?? '',
            assetUuid: identifier.assetUuid ?? '',
            assetUrl: identifier.assetUrl ?? '',
            name: dump.name.value as string,
            prefab: DumpConverter.convertPrefab(d.__prefab__),
            children: dump.children?.map((c: any) => DumpConverter.toNodeIdentifier(c)),
            components: d.__comps__?.map((c: any) => DumpConverter.toComponentIdentifier(c)),
        };
    }

    private static sceneToNode(dump: IScene, options?: IDumpConvertOptions): INodeInfo {
        const d = dump as any;
        return {
            nodeId: dump.uuid.value as string,
            path: options?.path || d.__path__ || '/',
            name: dump.name.value as string,
            properties: {
                active: dump.active.value as boolean,
                position: d.position?.value ?? { x: 0, y: 0, z: 0 },
                rotation: d.rotation?.value ?? { x: 0, y: 0, z: 0 },
                scale: d.scale?.value ?? { x: 1, y: 1, z: 1 },
                mobility: d.mobility?.value ?? 0,
                layer: d.layer?.value ?? 0,
            },
            children: dump.children?.map((c: any) => DumpConverter.toNodeIdentifier(c)),
            components: d.__comps__?.map((c: any) => DumpConverter.toComponentIdentifier(c)),
            prefab: DumpConverter.convertPrefab(d.__prefab__),
        };
    }

    private static nodeToNode(dump: INode, options?: IDumpConvertOptions): INodeInfo {
        const d = dump as any;
        return {
            nodeId: dump.uuid.value as string,
            path: options?.path || d.__path__ || '',
            name: dump.name.value as string,
            properties: {
                active: dump.active.value as boolean,
                position: dump.position.value,
                rotation: dump.rotation.value,
                scale: dump.scale.value,
                mobility: dump.mobility.value as number,
                layer: dump.layer.value as number,
            },
            components: dump.__comps__?.map(c => DumpConverter.toComponentIdentifier(c)),
            children: dump.children?.map((c: any) => DumpConverter.toNodeIdentifier(c)),
            prefab: DumpConverter.convertPrefab(dump.__prefab__),
        };
    }

    static toNodeIdentifier(childProp: any): INodeIdentifier {
        return {
            nodeId: childProp.value?.uuid ?? '',
            path: childProp.__path__ ?? '',
            name: childProp.__name__ ?? '',
        };
    }

    static toComponent(dump: IComponent): IComponentInfo {
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
            cid: dump.cid || '',
            path: dump.component_path || '',
            uuid: (dump.value?.uuid as any)?.value || '',
            name: (dump.value?.name as any)?.value || '',
            type: dump.type || '',
            enabled: (dump.value?.enabled as any)?.value ?? true,
            properties,
            prefab: (dump as any).__compPrefab__ ?? null,
        };
    }

    static toComponentIdentifier(dump: IComponent): IComponentIdentifier {
        return {
            cid: dump.cid || '',
            path: dump.component_path || '',
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
                propertyPath: DumpConverter.extractPropertyPath(po.value?.propertyPath),
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

    private static extractPropertyPath(prop: any): string[] {
        if (!prop?.value || !Array.isArray(prop.value)) return [];
        return prop.value.map((item: any) => String(item.value ?? ''));
    }
}
