import { Asset } from '@editor/asset-db';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';

import { dragonBones } from 'cc';

import { getDependUUIDList } from '../../utils';
import { AssetHandler } from '../../../@types/protected';

const DRAGONBONES_ENCODING = { encoding: 'utf8' };

function basenameNoExt(p: string): string {
    const b = path.basename(p);
    const ext = path.extname(p);
    return b.substring(0, b.length - ext.length);
}

export const DragonBonesHandler: AssetHandler = {
    name: 'dragonbones',

    assetType: 'dragonBones.DragonBonesAsset',

    async validate(asset: Asset) {
        let json;
        const assetpath = asset.source;
        if (assetpath.endsWith('.json')) {
            const text = fs.readFileSync(assetpath, 'utf8');
            try {
                json = JSON.parse(text);
            } catch (e) {
                return false;
            }
        } else {
            const bin = fs.readFileSync(assetpath);
            try {
                // https://github.com/nodejs/node/issues/11132
                const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
                json = dragonBones.BinaryDataParser.getInstance().parseDragonBonesData(ab);
            } catch (e) {
                return false;
            }
        }

        if (!json) {
            return false;
        }

        return Array.isArray(json.armature) || !!json.armatures;
    },

    importer: {
        version: '1.0.2',
        async import(asset: Asset) {
            const fspath = asset.source;
            const data = await fse.readFile(fspath, DRAGONBONES_ENCODING);
            const dragonBone: any = new dragonBones.DragonBonesAsset();
            dragonBone.name = basenameNoExt(fspath);
            if (fspath.endsWith('.json')) {
                dragonBone.dragonBonesJson = data;
            } else {
                await asset.copyToLibrary('.dbbin', fspath);
                dragonBone._setRawAsset('.dbbin');
            }

            const serializeJSON = EditorExtends.serialize(dragonBone);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default DragonBonesHandler;
