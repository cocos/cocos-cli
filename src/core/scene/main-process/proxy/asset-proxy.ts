import { IPublicAssetService } from '../../common';
import { Rpc } from '../rpc';

export const AssetProxy: IPublicAssetService = {
    assetChanged(): Promise<void> {
        return Rpc.getInstance().request('Asset', 'assetChanged');
    },
    assetDeleted(): Promise<void> {
        return Rpc.getInstance().request('Asset', 'assetDeleted');
    },
};
