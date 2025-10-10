import { basename, join } from 'path';
import { BundleManager } from '.';
import { BundleCompressionTypes } from '../../../../share/bundle-utils';
import { buildAssetLibrary } from '../../manager/asset-library';
import { walk } from '../json-group';
import * as HashUuid from '../../utils/hash-uuid';
import { outputJSON } from 'fs-extra';
import { compareUUID } from '../../../../share/utils';
import { ImageAsset, js, Texture2D } from 'cc';
import i18n from '../../../../../base/i18n';
import { IBundle, IGroup } from '../../../../@types/protected';

export async function handleJsonGroup(bundle: IBundle) {
    console.debug(`handle json group in bundle ${bundle.name}`);
    // 不压缩
    if (bundle.compressionType === BundleCompressionTypes.NONE) { return; }
    if (bundle.compressionType === BundleCompressionTypes.MERGE_ALL_JSON) {
        // 全部压缩为一个 json
        bundle.addGroup('NORMAL', bundle.assetsWithoutRedirect);
    } else {
        // 分组信息存放位置
        const groups: Record<string, string[]> = {};
        const hasInGroup: string[] = [];
        const textureUuids: string[] = [];

        // 每个根资源与场景生成一个分组
        // 默认情况下将会尽量的合并分组，被 Bundle 内其他根资源依赖的根资源不独立成组
        for (const uuid of bundle.assetsWithoutRedirect) {
            const assetInfo = buildAssetLibrary.getAsset(uuid);
            const assetType = buildAssetLibrary.getAssetProperty(assetInfo, 'type');
            if (assetType == 'cc.Texture2D') {
                textureUuids.push(assetInfo.uuid);
                continue;
            }
            let groupUuids = await walk(assetInfo, bundle);
            if (groupUuids.length <= 1) {
                continue;
            }
            // 过滤已经在其他分组内的依赖资源 uuid
            groupUuids = groupUuids.filter((uuid) => !hasInGroup.includes(uuid));
            if (groupUuids.length <= 1) {
                continue;
            }
            hasInGroup.push(...groupUuids);
            groups[uuid] = groupUuids;
        }
        if (textureUuids.length > 1) {
            textureUuids.sort(compareUUID);
            bundle.addGroup('TEXTURE', textureUuids);
        }

        Object.keys(groups).forEach((rootUuid) => {
            const groupUuids = groups[rootUuid];
            if (!groupUuids) {
                return;
            }
            const uudis: string[] = JSON.parse(JSON.stringify(groupUuids));
            uudis.forEach((uuid) => {
                if (rootUuid === uuid) {
                    return;
                }
                if (groups[uuid]) {
                    console.debug(`remove group uuid ${uuid}`);
                    delete groups[uuid];
                }
            });
        });

        // 重新计算分组
        // const arr = splitGroups(groups, true);
        Object.values(groups).forEach((uuids, index) => {
            // 过滤掉只有一个资源的数组
            if (uuids.length <= 1) { return; }
            bundle.addGroup('NORMAL', uuids);
        });
    }
    console.debug(`handle json group in bundle ${bundle.name} success`);
}

export async function outputJsonGroup(bundle: IBundle, manager: BundleManager) {
    const dest = join(bundle.dest, bundle.importBase);
    console.debug(`Handle all json groups in bundle ${bundle.name}`);
    let hasBuild: string[] = [];
    // 循环分组，计算每个分组的 hash 值
    const uuids: string[][] = [];
    bundle.groups.forEach((group) => {
        uuids.push(group.uuids);
        if (group.uuids.length <= 1) {
            return;
        }
        hasBuild = hasBuild.concat(group.uuids);
    });
    const hasBuildSet = new Set(hasBuild);
    const hashUuids: string[] = HashUuid.calculate(uuids, HashUuid.BuiltinHashType.PackedAssets);
    // 循环分组，执行实际处理
    console.debug('handle json group');

    const assetSerializeOptions = {
        debug: manager.options.debug,
        ...manager.options.assetSerializeOptions,
    };
    for (let index = 0; index < bundle.groups.length; index++) {
        const group = bundle.groups[index];

        if (group.uuids.length <= 1) {
            continue;
        }
        // 分组名设置成当时的 hash 名字，并将 assets 进行排序
        group.name = hashUuids[index];
        group.uuids.sort(compareUUID);
        bundle.addAssetWithUuid(group.name);
        hasBuildSet.add(group.name);
        // 如果分组类型不是 type，则跳过，这里可能是 spriteFrame 或者 texture
        if (group.type === 'TEXTURE') {
            await packTextures(dest, hashUuids[index], group);
            continue;
        }
        if (group.type === 'IMAGE') {
            await packImageAsset(dest, hashUuids[index], group);
            continue;
        }
        if (group.type !== 'NORMAL') {
            continue;
        }
        // 去重
        // group.uuids = Array.from(new Set(groupItem.jsonUuids));

        // 拼接 json 数据
        let jsons: Array<any | null> = [];
        const realUuids: string[] = [];
        group.uuids.sort();
        for (let i = 0; i < group.uuids.length; i++) {
            const assetInfo = buildAssetLibrary.getAsset(group.uuids[i]);
            if (assetInfo && (!assetInfo.meta.files.includes('.json'))) {
                // 分组塞 uuid 时并不会判断是否有 json，这里需要过滤
                continue;
            }
            const json = await manager.cache.getSerializedJSON(group.uuids[i], assetSerializeOptions);
            if (!json) {
                console.error(i18n.t('builder.error.get_asset_json_failed', {
                    url: assetInfo.url,
                    type: buildAssetLibrary.getAssetProperty(assetInfo, 'type'),
                }));
                continue;
            }
            realUuids.push(group.uuids[i]);
            jsons.push(json);
        }
        group.uuids = realUuids;
        jsons = JSON.parse(JSON.stringify(jsons));
        jsons = EditorExtends.serializeCompiled.packJSONs(jsons);
        await outputSerializeJSON(dest, hashUuids[index], jsons);
        // 输出部分信息
        console.debug(`Json group(${group.name}) compile success，json number: ${jsons.length}`);
    }
    console.debug('handle single json');
    // 循环所有需要输出的资源，打印单个 json 数据
    for (const uuid of bundle.assetsWithoutRedirect) {
        if (hasBuildSet.has(uuid)) {
            continue;
        }

        // 只有一个 uuid 的分组按照原来的规则生成
        const json = await manager.cache.getSerializedJSON(uuid, assetSerializeOptions);
        if (!json) {
            continue;
        }

        // Hack 输出 uuid 不一定和原始 uuid 一样，特殊字符打包出来的 uuid 要与 library 里的一致
        const asset = buildAssetLibrary.getAsset(uuid);
        let destName = uuid;
        // 资源 asset 不一定存在，因为有可能是类似于合图这样新生成的资源数据
        if (asset && asset.library && asset.meta.files.includes('.json')) {
            destName = basename(asset.library);
        }
        await outputSerializeJSON(dest, destName, json);
    }

    bundle.groups.forEach((group) => {
        if (group.name) {
            bundle.addAssetWithUuid(group.name);
        }
    });

    /**
     * 合并 imageAsset 序列化信息
     */
    async function packImageAsset(dest: string, name: string, groupItem: IGroup) {
        const values = await Promise.all(
            groupItem.uuids.map(async (uuid) => {
                const data = await manager.cache.getSerializedJSON(uuid, assetSerializeOptions);
                if (!data) {
                    console.error(`Can't get SerializedJSON of asset {asset(${uuid})}`);
                }
                return data;
            }),
        );
        const packedData = {
            type: js.getClassId(ImageAsset),
            data: values,
        };
        await outputSerializeJSON(dest, name, packedData);
    }

    /**
     * 合并 texture 资源
     * @param groupItem
     */
    async function packTextures(dest: string, name: string, groupItem: IGroup) {
        const jsons = await Promise.all(
            groupItem.uuids.map(async (uuid) => {
                const data = await manager.cache.getSerializedJSON(uuid, assetSerializeOptions);
                if (!data) {
                    console.error(`Can't get SerializedJSON of asset {asset(${uuid})}`);
                }
                return data;
            }),
        );
        const values = jsons.map((json: any) => {
            // @ts-ignore
            const { base, mipmaps } = EditorExtends.serializeCompiled.getRootData(json);
            return [base, mipmaps];
        });
        const packedData = {
            type: js.getClassId(Texture2D),
            data: values,
        };
        await outputSerializeJSON(dest, name, packedData);
    }

    async function outputSerializeJSON(dest: string, name: string, json: any) {
        // 将拼接好的数据，实际写到指定位置
        const path = join(dest, name.substr(0, 2), name + '.json');
        // json = _compressJson(json);
        await outputJSON(path, json);
    }
}
