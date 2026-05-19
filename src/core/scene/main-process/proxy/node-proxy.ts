import {
    INodeTreeItem,
    ICreateByNodeTypeOptions,
    ICreateByAssetOptions,
    IQueryNodeOptions,
    IQueryNodeTreeOptions,
    IDeleteNodeOptions,
    IDeleteNodeResult,
    IUpdateNodeParams,
    IUpdateNodeResult,
    IPublicNodeService,
} from '../../common';
import { INodeInfo } from '../../common/cli/node';
import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface INodeProxy extends Omit<IPublicNodeService, 'createByType' | 'createByAsset' | 'query' | 'getPathByUuid'> {
    createByType(options: ICreateByNodeTypeOptions): Promise<INodeInfo | null>;
    createByAsset(options: ICreateByAssetOptions): Promise<INodeInfo | null>;
    query(options?: IQueryNodeOptions): Promise<INodeInfo | null>;
    update(options: IUpdateNodeParams): Promise<IUpdateNodeResult>;
}

export const NodeProxy: INodeProxy = {
    async createByType(options: ICreateByNodeTypeOptions): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByType', [options]);
        return result ? DumpConverter.toNode(result, { children: true }) : null;
    },
    async createByAsset(options: ICreateByAssetOptions): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByAsset', [options]);
        return result ? DumpConverter.toNode(result, { children: true }) : null;
    },
    delete(options: IDeleteNodeOptions): Promise<IDeleteNodeResult | null> {
        return Rpc.getInstance().request('Node', 'delete', [options]);
    },
    async update(options: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        const nodeDump: any = await Rpc.getInstance().request('Node', 'query', [{ path: options.path, queryChildren: false, queryComponent: false }]);
        if (!nodeDump) {
            throw new Error(`Node not found: ${options.path}`);
        }

        const properties: Record<string, any> = {};
        if (options.properties) {
            const p = options.properties;
            if (p.position) properties.position = p.position;
            if (p.rotation) properties.rotation = p.rotation;
            if (p.scale) properties.scale = p.scale;
            if (p.active !== undefined) properties.active = p.active;
            if (p.mobility !== undefined) properties.mobility = p.mobility;
            if (p.layer !== undefined) properties.layer = p.layer;
        }

        for (const [key, value] of Object.entries(properties)) {
            const propDef = nodeDump[key];
            if (!propDef) {
                throw new Error(`Property '${key}' not found on node`);
            }
            await (Rpc.getInstance() as any).request('Node', 'setProperty', [{
                nodePath: options.path,
                path: key,
                dump: { ...propDef, value },
            }]);
        }

        let currentPath = options.path;
        if (options.name) {
            const nameDef = nodeDump.name;
            if (!nameDef) {
                throw new Error('Property \'name\' not found on node');
            }
            await (Rpc.getInstance() as any).request('Node', 'setProperty', [{
                nodePath: options.path,
                path: 'name',
                dump: { ...nameDef, value: options.name },
            }]);
            const segments = currentPath.split('/');
            segments[segments.length - 1] = options.name;
            currentPath = segments.join('/');
        }

        return { path: currentPath };
    },
    async query(options?: IQueryNodeOptions): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'query', [options]);
        if (!result) return null;
        return DumpConverter.toNode(result, { path: options?.path, fullComponents: true });
    },
    queryNodeTree(options: IQueryNodeTreeOptions): Promise<INodeTreeItem | null> {
        return Rpc.getInstance().request('Node', 'queryNodeTree', [options]);
    },
};
