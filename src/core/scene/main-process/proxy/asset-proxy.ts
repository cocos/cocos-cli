import { IPublicAssetService } from '../../common';
import { Rpc } from '../rpc';

export const AssetProxy: IPublicAssetService = {
    changed(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Asset', 'changed', [uuid]);
    },
    deleted(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Asset', 'deleted', [uuid]);
    },
};
