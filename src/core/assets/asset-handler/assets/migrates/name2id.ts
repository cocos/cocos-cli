'use strict';

import { Asset } from '@cocos/asset-db';
import { nameToId } from '@cocos/asset-db/libs/utils';

export function migrate(asset: Asset) {
    Object.keys(asset.subAssets).forEach((name) => {
        const id = nameToId(name);
        const subAsset = asset.subAssets[name];
        subAsset.meta.uuid = subAsset.uuid.replace(name, id);
    });
}
