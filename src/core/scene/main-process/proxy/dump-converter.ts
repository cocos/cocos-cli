'use strict';

import type {
    INodeInfo,
    INode,
    IComponentInfo,
    IComponent,
    IComponentIdentifier,
    IPrefab,
    IPrefabInfo,
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
            prefab: d.__prefabInfo__ ?? null,
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
                position: d.__position__ || { x: 0, y: 0, z: 0 },
                rotation: d.__rotation__ || { x: 0, y: 0, z: 0, w: 1 },
                eulerAngles: { x: 0, y: 0, z: 0 },
                scale: d.__scale__ || { x: 1, y: 1, z: 1 },
                mobility: d.__mobility__ ?? 0,
                layer: d.__layer__ ?? 0,
            },
            children: children
                ? d.__childNodes__?.map((c: INode) => DumpConverter.toNode(c, options))
                : undefined,
            prefab: null,
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
                rotation: d.__rotation__ || DumpConverter.eulerToQuat(dump.rotation.value),
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
            prefab: d.__prefabInfo__ ?? DumpConverter.convertPrefab(dump.__prefab__) ?? null,
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

    private static convertPrefab(prefab?: IPrefab): IPrefabInfo | null {
        if (!prefab) return null;
        return {
            fileId: prefab.fileId,
            targetOverrides: [],
            nestedPrefabInstanceRoots: [],
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
            y: cx * sy * cz - sx * cy * sz,
            z: cx * cy * sz - sx * sy * cz,
            w: cx * cy * cz + sx * sy * sz,
        };
    }
}
