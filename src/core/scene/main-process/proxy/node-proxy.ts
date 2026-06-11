import {
    INodeTreeItem,
    ICreateByNodeTypeParams,
    ICreateByAssetParams,
    IQueryNodeParams,
    IQueryNodeTreeParams,
    IDeleteNodeParams,
    IDeleteNodeResult,
    IUpdateNodeParams,
    IUpdateNodeResult,
    IPublicNodeService,
} from '../../common';
import { INodeInfo } from '../../common/cli/node';
import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface INodeProxy extends Omit<IPublicNodeService, 'createByType' | 'createByAsset' | 'query' | 'getPathByUuid' | 'setParent' | 'reorder' | 'copy' | 'paste' | 'duplicate' | 'cut' | 'moveArrayElement' | 'removeArrayElement' | 'changeNodeLock'> {
    createByType(params: ICreateByNodeTypeParams): Promise<INodeInfo | null>;
    createByAsset(params: ICreateByAssetParams): Promise<INodeInfo | null>;
    query(params?: IQueryNodeParams): Promise<INodeInfo | null>;
    update(params: IUpdateNodeParams): Promise<IUpdateNodeResult>;
}

export const NodeProxy: INodeProxy = {
    async createByType(params: ICreateByNodeTypeParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByType', [params]);
        return result ? DumpConverter.toNode(result) : null;
    },
    async createByAsset(params: ICreateByAssetParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByAsset', [params]);
        return result ? DumpConverter.toNode(result) : null;
    },
    delete(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        return Rpc.getInstance().request('Node', 'delete', [params]);
    },
    async update(params: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        const nodeDump: any = await Rpc.getInstance().request('Node', 'query', [{ path: params.path }]);
        if (!nodeDump) {
            throw new Error(`Node not found: ${params.path}`);
        }

        const properties: Record<string, any> = {};
        if (params.properties) {
            const p = params.properties;
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
                nodePath: params.path,
                path: key,
                dump: { ...propDef, value },
            }]);
        }

        let currentPath = params.path;
        if (params.name) {
            const nameDef = nodeDump.name;
            if (!nameDef) {
                throw new Error('Property \'name\' not found on node');
            }
            await (Rpc.getInstance() as any).request('Node', 'setProperty', [{
                nodePath: params.path,
                path: 'name',
                dump: { ...nameDef, value: params.name },
            }]);
            const segments = currentPath.split('/');
            segments[segments.length - 1] = params.name;
            currentPath = segments.join('/');
        }

        return { path: currentPath };
    },
    async query(params?: IQueryNodeParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'query', [{
            path: params?.path ?? '',
            includeChildren: params?.includeChildren ?? false,
            includeComponents: params?.includeComponents ?? false,
        }]);
        if (!result) return null;
        return DumpConverter.toNode(result, { path: params?.path });
    },
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null> {
        return Rpc.getInstance().request('Node', 'queryNodeTree', [params]);
    },
};
