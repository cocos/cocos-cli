import {
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    IPublicComponentService,
} from '../../common';
import { IComponentInfo } from '../../common/cli/component';
import { ISetComponentPropertyOptions } from '../../common/cli/component';

import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface IComponentProxy extends Omit<IPublicComponentService, 'add' | 'query' | 'setProperty' | 'getPathByUuid'> {
    add(options: IAddComponentOptions): Promise<IComponentInfo>;
    query(options: IQueryComponentOptions): Promise<IComponentInfo | null>;
    setProperty(options: ISetComponentPropertyOptions): Promise<boolean>;
}

export const ComponentProxy: IComponentProxy = {
    async add(options: IAddComponentOptions): Promise<IComponentInfo> {
        const result: any = await Rpc.getInstance().request('Component', 'add', [options]);
        return DumpConverter.toComponent(result);
    },

    remove(options: IRemoveComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'remove', [options]);
    },

    async query(options: IQueryComponentOptions): Promise<IComponentInfo | null> {
        const result: any = await Rpc.getInstance().request('Component', 'query', [options]);
        if (!result) return null;
        if (typeof options !== 'string') {
            return DumpConverter.toComponent(result);
        }
        return result;
    },

    async setProperty(options: ISetComponentPropertyOptions): Promise<boolean> {
        const segments = options.componentPath.split('/');
        segments.pop();
        const nodePath = segments.join('/');

        const compDump: any = await Rpc.getInstance().request('Component', 'query', [options.componentPath]);
        if (!compDump) {
            throw new Error(`Component not found: ${options.componentPath}`);
        }

        const nodeTree: any = await Rpc.getInstance().request('Node', 'queryNodeTree', [{ path: nodePath }]);
        if (!nodeTree) {
            throw new Error(`Node not found: ${nodePath}`);
        }
        const compUuid = compDump.value?.uuid?.value;
        const compIndex = nodeTree.components.findIndex((c: any) => c.value === compUuid);
        if (compIndex < 0) {
            throw new Error(`Component index not found: ${options.componentPath}`);
        }

        for (const [key, value] of Object.entries(options.properties)) {
            const propDef = compDump.value?.[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on component`);
            }
            await Rpc.getInstance().request('Component', 'setProperty', [{
                nodePath,
                path: `__comps__.${compIndex}.${key}`,
                dump: { ...propDef, value },
                record: options.record,
            }] as any);
        }
        return true;
    },

    queryAll(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAll');
    },
};
