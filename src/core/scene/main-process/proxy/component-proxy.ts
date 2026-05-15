import {
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    IPublicComponentService,
} from '../../common';
import { IComponentInfo } from '../../common/cli/component';
import { ISetPropertyOptionsInfo } from '../../common/cli/component';

import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface IComponentProxy extends Omit<IPublicComponentService, 'add' | 'query' | 'setProperty'> {
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

        for (const [key, value] of Object.entries(params.properties)) {
            const propDef = compDump.value?.[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on component`);
            }
            await Rpc.getInstance().request('Component', 'setProperty', [{
                nodePath,
                path: `__comps__.${compIndex}.${key}`,
                dump: { ...propDef, value },
                record: params.record,
            }] as any);
        }
        return true;
    },

    queryAll(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAll');
    },
};
