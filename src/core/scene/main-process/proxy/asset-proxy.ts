import { IPublicAssetService } from '../../common';
import { Rpc } from '../rpc';

export const AssetProxy: IPublicAssetService = {
    assetChanged(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Asset', 'assetChanged', [uuid]);
    },
    assetDeleted(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Asset', 'assetDeleted', [uuid]);
    },
};
