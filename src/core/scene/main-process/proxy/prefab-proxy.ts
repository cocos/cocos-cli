import type {
    IApplyPrefabChangesParams,
    ICreatePrefabFromNodeParams,
    IGetPrefabInfoParams, IIsPrefabInstanceParams, INode,
    IPublicPrefabService, IRevertToPrefabParams, IUnpackPrefabInstanceParams,
    IPrefabInfo,
} from '../../common';
import { Rpc } from '../rpc';

export const PrefabProxy: IPublicPrefabService = {
    applyPrefabChanges(params: IApplyPrefabChangesParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'applyPrefabChanges', [params]);
    },
    createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INode> {
        return Rpc.getInstance().request('Prefab', 'createPrefabFromNode', [params]);
    },
    getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null> {
        return Rpc.getInstance().request('Prefab', 'getPrefabInfo', [params]);
    },
    isPrefabInstance(params: IIsPrefabInstanceParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'isPrefabInstance', [params]);
    },
    revertToPrefab(params: IRevertToPrefabParams): Promise<boolean> {
        return Rpc.getInstance().request('Prefab', 'revertToPrefab', [params]);
    },
    unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INode> {
        return Rpc.getInstance().request('Prefab', 'unpackPrefabInstance', [params]);
    }
};