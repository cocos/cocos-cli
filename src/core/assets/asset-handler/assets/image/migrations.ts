import { Asset, queryUrl } from '@editor/asset-db';
import utils from '../../../../base/utils';

export const migrations = [
    {
        version: '1.0.27',
        migrate: migrateRedirect,
    },
];

export function migrateRedirect(asset: Asset) {
    if (asset.userData.type === 'texture') {
        return;
    }
    if (asset.userData.type === 'sprite-frame') {
        if (!asset.meta.subMetas[utils.UUID.nameToSubId('texture')]) {
            return;
        }
        asset.userData.redirect = asset.meta.subMetas[utils.UUID.nameToSubId('texture')].uuid;
        return;
    }

    delete asset.userData.redirect;
}
