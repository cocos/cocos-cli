import { Asset, queryAsset, queryUUID } from '@editor/asset-db';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';

import { dragonBones, Texture2D } from 'cc';
import { i18nTranslate, getDependUUIDList } from '../../utils';
import { AssetHandler } from '../../../@types/protected';

function basenameNoExt(p: string): string {
    const b = path.basename(p);
    const ext = path.extname(p);
    return b.substring(0, b.length - ext.length);
}

export const DragonBonesAtlasHandler: AssetHandler = {
    name: 'dragonbones-atlas',
    assetType: 'dragonBones.DragonBonesAtlasAsset',

    async validate(asset: Asset) {
        const assetpath = asset.source;
        let json;
        const text = fs.readFileSync(assetpath, 'utf8');
        try {
            json = JSON.parse(text);
        } catch (e) {
            return false;
        }
        return typeof json.imagePath === 'string' && Array.isArray(json.SubTexture);
    },

    importer: {
        version: '1.0.2',
        async import(asset: Asset) {
            const fspath = asset.source;
            const data = fse.readFileSync(fspath, { encoding: 'utf8' });

            const json = JSON.parse(data);

            // parse the depended texture
            const imgPath = path.resolve(path.dirname(fspath), json.imagePath);
            asset.depend(imgPath);
            const texAsset = queryAsset(imgPath);
            if (texAsset && !texAsset.init) {
                asset._assetDB.taskManager.pause(asset.task);
                await texAsset.waitInit();
                asset._assetDB.taskManager.resume(asset.task);
            }
            if (!texAsset || !texAsset.imported) {
                console.warn(
                    i18nTranslate('engine-extends.importers.dragonbones_atlas.texture_not_imported', { texture: imgPath }) +
                    ` {asset(${asset.uuid})}`,
                );
                return false;
            } else if (!fs.existsSync(imgPath)) {
                throw new Error(
                    i18nTranslate('engine-extends.importers.dragonbones_atlas.texture_not_found', {
                        atlas: fspath,
                        texture: json.imagePath,
                    }) + ` {asset(${asset.uuid})}`,
                );
            }

            const atlas = new dragonBones.DragonBonesAtlasAsset();
            atlas.name = basenameNoExt(fspath);
            atlas.atlasJson = data;
            atlas.texture = EditorExtends.serialize.asAsset(texAsset.uuid + '@6c48a', Texture2D);

            const serializeJSON = EditorExtends.serialize(atlas);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default DragonBonesAtlasHandler;
