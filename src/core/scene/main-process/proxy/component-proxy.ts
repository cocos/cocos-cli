import {
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    IPublicComponentService,
} from '../../common';
import { IComponentInfo } from '../../common/cli/component';
import { ISetPropertyOptionsInfo } from '../../common/cli/component';
import type { IAssetInfo } from '../../../assets/@types/public';
import { assetManager } from '../../../assets';

import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';
import { getExpectedAssetType, resolveAssetReference } from './asset-reference-resolver';

export interface IComponentProxy extends Omit<IPublicComponentService, 'add' | 'query' | 'setProperty' | 'getPathByUuid'> {
    add(params: IAddComponentOptions): Promise<IComponentInfo>;
    query(params: IQueryComponentOptions): Promise<IComponentInfo | null>;
    setProperty(params: ISetPropertyOptionsInfo): Promise<boolean>;
}

export const ComponentProxy: IComponentProxy = {
    async add(params: IAddComponentOptions): Promise<IComponentInfo> {
        const result: any = await Rpc.getInstance().request('Component', 'add', [params]);
        return DumpConverter.toComponent(result);
    },

    remove(params: IRemoveComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'remove', [params]);
    },

    async query(params: IQueryComponentOptions): Promise<IComponentInfo | null> {
        const result: any = await Rpc.getInstance().request('Component', 'query', [params]);
        if (!result) return null;
        if (typeof params !== 'string') {
            return DumpConverter.toComponent(result);
        }
        return result;
    },

    async setProperty(params: ISetPropertyOptionsInfo): Promise<boolean> {
        const segments = params.componentPath.split('/');
        segments.pop();
        const nodePath = segments.join('/');

        const compDump: any = await Rpc.getInstance().request('Component', 'query', [params.componentPath]);
        if (!compDump) {
            throw new Error(`Component not found: ${params.componentPath}`);
        }

        const nodeTree: any = await Rpc.getInstance().request('Node', 'queryNodeTree', [{ path: nodePath }]);
        if (!nodeTree) {
            throw new Error(`Node not found: ${nodePath}`);
        }
        const compUuid = compDump.value?.uuid?.value;
        const compIndex = nodeTree.components.findIndex((c: any) => c.value === compUuid);
        if (compIndex < 0) {
            throw new Error(`Component index not found: ${params.componentPath}`);
        }

        const assetInfoCache = new Map<string, Promise<IAssetInfo | null>>();
        const queryAssetInfo = (urlOrUuid: string): Promise<IAssetInfo | null> => {
            let pending = assetInfoCache.get(urlOrUuid);
            if (!pending) {
                pending = Promise.resolve(assetManager.queryAssetInfo(urlOrUuid, ['subAssets', 'extends']));
                assetInfoCache.set(urlOrUuid, pending);
            }
            return pending;
        };
        const pendingUpdates: Array<{ key: string; propDef: any; dumpValue: any }> = [];

        for (const [key, value] of Object.entries(params.properties)) {
            const propDef = compDump.value?.[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on component`);
            }
            let dumpValue: any;
            if (propDef.isArray && propDef.elementTypeData && Array.isArray(value)) {
                const expectedAssetType = getExpectedAssetType(propDef);
                const resolvedItems = expectedAssetType
                    ? await Promise.all(value.map((item) => resolveAssetReference(item, expectedAssetType, key, queryAssetInfo)))
                    : value;
                dumpValue = resolvedItems.map((item, i) => ({
                    ...propDef.elementTypeData,
                    name: String(i),
                    value: item,
                }));
            } else {
                const expectedAssetType = getExpectedAssetType(propDef);
                dumpValue = expectedAssetType
                    ? await resolveAssetReference(value, expectedAssetType, key, queryAssetInfo)
                    : value;
            }
            pendingUpdates.push({ key, propDef, dumpValue });
        }

        for (const { key, propDef, dumpValue } of pendingUpdates) {
            await Rpc.getInstance().request('Component', 'setProperty', [{
                nodePath,
                path: `__comps__.${compIndex}.${key}`,
                dump: { ...propDef, value: dumpValue },
                record: params.record,
            }] as any);
        }
        return true;
    },

    queryAll(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAll');
    },
};
