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

export interface IPrefabProxy extends Omit<IPublicPrefabService, 'createPrefabFromNode' | 'unpackPrefabInstance' | 'getPrefabInfo' | 'unlinkPrefab'> {
    createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INodeInfo>;
    unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INodeInfo>;
    getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null>;
}

export const PrefabProxy: IPrefabProxy = {
    applyPrefabChanges(params: IApplyPrefabChangesParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'applyPrefabChanges', [params]);
    },
    async createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INodeInfo> {
        const result: any = await Rpc.getInstance().request('Prefab', 'createPrefabFromNode', [params]);
        return DumpConverter.toNode(result);
    },
    async getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null> {
        const result: any = await Rpc.getInstance().request('Prefab', 'getPrefabInfo', [params]);
        if (!result) return null;
        return DumpConverter.convertPrefab(result);
    },
    isPrefabInstance(params: IIsPrefabInstanceParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'isPrefabInstance', [params]);
    },
    revertToPrefab(params: IRevertToPrefabParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'revertToPrefab', [params]);
    },
    async unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INodeInfo> {
        const result: any = await Rpc.getInstance().request('Prefab', 'unpackPrefabInstance', [params]);
        return DumpConverter.toNode(result);
    }
};