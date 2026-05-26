import type {
    IApplyPrefabChangesParams,
    ICreatePrefabFromNodeParams,
    IGetPrefabInfoParams, IIsPrefabInstanceParams,
    IPublicPrefabService, IRevertToPrefabParams, IUnpackPrefabInstanceParams,
    IPrefabInfo,
} from '../../common';
import { INodeInfo } from '../../common/cli/node';
import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface IPrefabProxy extends Omit<IPublicPrefabService, 'createFromNode' | 'unpack' | 'getInfo'> {
    createFromNode(params: ICreatePrefabFromNodeParams): Promise<INodeInfo>;
    unpack(params: IUnpackPrefabInstanceParams): Promise<INodeInfo>;
    getInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null>;
}

export const PrefabProxy: IPrefabProxy = {
    applyChanges(params: IApplyPrefabChangesParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'applyChanges', [params]);
    },
    async createFromNode(params: ICreatePrefabFromNodeParams): Promise<INodeInfo> {
        const result: any = await Rpc.getInstance().request('Prefab', 'createFromNode', [params]);
        return DumpConverter.toNode(result, { children: false });
    },
    async getInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null> {
        const result: any = await Rpc.getInstance().request('Prefab', 'getInfo', [params]);
        if (!result) return null;
        return DumpConverter.convertPrefab(result);
    },
    isInstance(params: IIsPrefabInstanceParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'isInstance', [params]);
    },
    revert(params: IRevertToPrefabParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'revert', [params]);
    },
    async unpack(params: IUnpackPrefabInstanceParams): Promise<INodeInfo> {
        const result: any = await Rpc.getInstance().request('Prefab', 'unpack', [params]);
        return DumpConverter.toNode(result);
    }
};
