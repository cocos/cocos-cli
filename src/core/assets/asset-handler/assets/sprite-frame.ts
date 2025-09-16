'use strict';

import { Asset, VirtualAsset, queryPath, queryUUID, queryAsset } from '@editor/asset-db';
import * as cc from 'cc';

import { AssetHandler } from '../../@types/protected';
import { SpriteFrameBaseAssetUserData, SpriteFrameAssetUserData } from '../../@types/userDatas';
import { getTrimRect, getDependUUIDList } from '../utils';
import { defaultIconConfig } from './image/utils';
import i18n from '../../../base/i18n';

try {
    require('sharp');
} catch (error) {
    console.error(error);
    console.error(i18n.t('engine-extends.importers.sharpError'));
}

const Sharp = require('sharp');

Sharp.cache(false);

export const SpriteFrameHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'sprite-frame',

    assetType: 'cc.SpriteFrame',
    iconInfo: {
        default: defaultIconConfig,
        async generateThumbnail(asset: Asset) {
            let parentAsset = queryAsset(asset.meta.userData.imageUuidOrDatabaseUri) as Asset;
            if (parentAsset.meta.importer !== 'image') {
                parentAsset = parentAsset.parent as Asset;
            }
            if (parentAsset.invalid) {
                return defaultIconConfig;
            }
            const extname = parentAsset.meta.files.find((extName) => extName !== '.json') || '.png';
            const imagePath = parentAsset.library + extname;
            const dest = asset.library + '_sprite_trim_' + extname;
            const userData = asset.userData as SpriteFrameBaseAssetUserData;
            try {
                await trimImage(imagePath, dest, userData);
            } catch (error) {
                console.warn(`trim image {file(${imagePath})} to generate thumbnail failed~`);
                console.warn(error);
                return defaultIconConfig;
            }
            return {
                type: 'image',
                value: dest,
            };
        },
    },

    userDataConfig: {
        default: {
            trimType: {
                default: 'auto',
                label: 'i18n:ENGINE.assets.spriteFrame.trimType',
                render: {
                    ui: 'ui-select',
                    items: [
                        {
                            label: 'auto',
                            value: 'auto',
                        },
                        {
                            label: 'custom',
                            value: 'custom',
                        },
                        {
                            label: 'none',
                            value: 'none',
                        },
                    ],
                },
            },
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.12',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            // 如果没有生成 json 文件，则重新生成
            if (!asset.parent) {
                return false;
            }

            if (asset.parent.meta.importer === 'image') {
                const userData = asset.userData as SpriteFrameBaseAssetUserData;
                let file;
                // TODO 此处需要更换通用写法，这样容易漏掉一些新格式支持的更新
                // @ts-ignore
                if (['.tga', '.hdr', '.bmp', '.exr', '.znt', '.psd'].includes(asset.parent.extname.toLowerCase())) {
                    file = asset.parent.library + '.png';
                } else {
                    file = asset.parent.source;
                }
                const MIN_SIZE = 1;
                const imageData = await Sharp(file).raw().toBuffer({ resolveWithObject: true });
                if (!imageData) {
                    return false;
                }
                if (userData.trimThreshold === undefined) {
                    userData.trimThreshold = 1;
                }

                userData.rotated = !!userData.rotated;
                userData.packable = userData.packable === undefined ? true : userData.packable;
                userData.rawHeight = imageData.info.height;
                userData.rawWidth = imageData.info.width;

                if (userData.trimType === 'auto') {
                    if (imageData.info.channels !== 4) {
                        userData.width = imageData.info.width;
                        userData.height = imageData.info.height;
                        userData.trimX = 0;
                        userData.trimY = 0;
                    } else {
                        const rect = getTrimRect(
                            Buffer.from(imageData.data),
                            userData.rawWidth,
                            userData.rawHeight,
                            userData.trimThreshold,
                        );
                        userData.width = Math.max(rect[2], MIN_SIZE);
                        userData.height = Math.max(rect[3], MIN_SIZE);
                        userData.trimX = cc.clamp(rect[0], 0, userData.rawWidth - userData.width);
                        userData.trimY = cc.clamp(rect[1], 0, userData.rawHeight - userData.height);
                    }
                } else if (userData.trimType === 'none') {
                    userData.trimX = 0;
                    userData.trimY = 0;
                    userData.width = imageData.info.width;
                    userData.height = imageData.info.height;
                } else {
                    userData.trimX = cc.clamp(userData.trimX, 0, userData.rawWidth - MIN_SIZE);
                    userData.trimY = cc.clamp(userData.trimY, 0, userData.rawHeight - MIN_SIZE);
                    userData.width = cc.clamp(
                        userData.width === -1 ? userData.rawWidth : userData.width,
                        MIN_SIZE,
                        userData.rawWidth - userData.trimX,
                    );
                    userData.height = cc.clamp(
                        userData.height === -1 ? userData.rawHeight : userData.height,
                        MIN_SIZE,
                        userData.rawHeight - userData.trimY,
                    );
                }

                userData.offsetX = userData.trimX + userData.width / 2 - userData.rawWidth / 2;
                userData.offsetY = -(userData.trimY + userData.height / 2 - userData.rawHeight / 2);

                userData.borderLeft = cc.clamp(userData.borderLeft, 0, userData.width);
                userData.borderRight = cc.clamp(userData.borderRight, 0, userData.width - userData.borderLeft);
                userData.borderTop = cc.clamp(userData.borderTop, 0, userData.height);
                userData.borderBottom = cc.clamp(userData.borderBottom, 0, userData.height - userData.borderTop);

                // userData.pixelsToUnit = 100;
                // userData.pivotX = 0.5;
                // userData.pivotY = 0.5;
                // userData.meshType = 0;
                initVerticesData(userData);
            }

            // userData.vertices = undefined;

            const spriteFrame = createSpriteFrame(asset);
            if (asset.parent instanceof Asset) {
                spriteFrame.name = spriteFrame.name || asset.parent.basename || '';
            }
            getTexture(asset, spriteFrame);

            const serializeJSON = EditorExtends.serialize(spriteFrame);
            await asset.saveToLibrary('.json', serializeJSON);

            // plist 文件下导入的 sprite 序列化信息会记录父资源 uuid 但在依赖关系上并不依赖，需要走反序列化获取对的依赖关系
            const depends = getDependUUIDList(JSON.parse(serializeJSON));
            asset.setData('depends', depends);

            return true;
        },
    },
};
export default SpriteFrameHandler;

export interface TrimOptions {
    width: number;
    height: number;
    trimX: number;
    trimY: number;
    rotated: boolean;
}

export async function trimImage(source: string, dest: string, options: TrimOptions) {
    const image = Sharp(source).extract({
        left: options.trimX,
        top: options.trimY,
        width: options.rotated ? options.height : options.width,
        height: options.rotated ? options.width : options.height,
    });
    if (options.rotated) {
        image.rotate(270);
    }
    return await image.toFile(dest);
}

function createSpriteFrame(asset: Asset) {
    const userData = asset.userData;
    const sprite = new cc.SpriteFrame();
    sprite.name = asset.displayName ? asset.displayName : asset._name;
    sprite.atlasUuid = userData.atlasUuid;
    // @ts-ignore
    sprite._rect = cc.rect(userData.trimX, userData.trimY, userData.width, userData.height);

    // @ts-ignore
    sprite._originalSize = cc.size(userData.rawWidth, userData.rawHeight);
    // @ts-ignore
    sprite._offset = cc.v2(userData.offsetX, userData.offsetY);
    // @ts-ignore
    sprite._capInsets = [userData.borderLeft, userData.borderTop, userData.borderRight, userData.borderBottom];
    // @ts-ignore
    sprite._rotated = userData.rotated;
    // @ts-ignore
    sprite._packable = userData.packable;
    // @ts-ignore
    sprite._pixelsToUnit = userData.pixelsToUnit;
    // @ts-ignore
    sprite._pivot = cc.v2(userData.pivotX, userData.pivotY);
    // @ts-ignore
    sprite._meshType = userData.meshType;
    // @ts-ignore
    initVertices(sprite, userData);
    return sprite;
}

function getTexture(asset: VirtualAsset, spriteFrame: cc.SpriteFrame) {
    const userData = asset.userData as SpriteFrameAssetUserData;
    // Get Texture
    const imageUuidOrDatabaseUri = userData.imageUuidOrDatabaseUri;
    if (!imageUuidOrDatabaseUri) {
        return;
    } else {
        let imageUuid: string | null = null;
        if (userData.isUuid) {
            imageUuid = imageUuidOrDatabaseUri;
        } else {
            imageUuid = queryUUID(imageUuidOrDatabaseUri);
            if (!imageUuid) {
                console.warn(`Cannot find image ${queryPath(imageUuidOrDatabaseUri) || ''}.`);
            }
        }
        if (imageUuid !== null) {
            // @ts-ignore
            spriteFrame._texture = EditorExtends.serialize.asAsset(imageUuid, cc.Texture2D);
        }
    }
}

function initVerticesData(userData: SpriteFrameBaseAssetUserData) {
    if (userData.vertices === undefined) {
        userData.vertices = {
            rawPosition: [],
            indexes: [],
            uv: [],
            nuv: [],
            minPos: [],
            maxPos: [],
        };
    }
    const vertices = userData.vertices;
    vertices.rawPosition.length = 0;

    if (userData.meshType === cc.SpriteFrame.MeshType.POLYGON) {
        // 使用 Bayazit 来生成顶点并赋值
    } else {
        const width = userData.width;
        const height = userData.height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const texw = userData.rawWidth;
        const texh = userData.rawHeight;
        const rectX = userData.trimX;
        const rectY = texh - userData.trimY - height;
        const l = texw === 0 ? 0 : rectX / texw;
        const r = texw === 0 ? 1 : (rectX + width) / texw;
        const t = texh === 0 ? 1 : (rectY + height) / texh;
        const b = texh === 0 ? 0 : rectY / texh;
        vertices.rawPosition = [-halfWidth, -halfHeight, 0, halfWidth, -halfHeight, 0, -halfWidth, halfHeight, 0, halfWidth, halfHeight, 0];
        vertices.uv = [rectX, rectY + height, rectX + width, rectY + height, rectX, rectY, rectX + width, rectY];
        vertices.nuv = [l, b, r, b, l, t, r, t];
        vertices.indexes = [0, 1, 2, 2, 1, 3];
        vertices.minPos = [-halfWidth, -halfHeight, 0];
        vertices.maxPos = [halfWidth, halfHeight, 0];
    }
}

function initVertices(sprite: cc.SpriteFrame, userData: SpriteFrameBaseAssetUserData) {
    const userVertices = userData.vertices;
    sprite.vertices = {
        rawPosition: [],
        positions: [],
        indexes: userVertices.indexes,
        uv: userVertices.uv,
        nuv: userVertices.nuv,
        minPos: cc.v3(userVertices.minPos[0], userVertices.minPos[1], userVertices.minPos[2]),
        maxPos: cc.v3(userVertices.maxPos[0], userVertices.maxPos[1], userVertices.maxPos[2]),
    };
    const vertices = sprite.vertices;
    const rawPosition = userVertices.rawPosition;
    const tempVec3 = cc.v3();
    for (let i = 0; i < rawPosition.length; i += 3) {
        tempVec3.set(rawPosition[i], rawPosition[i + 1], rawPosition[i + 2]);
        vertices.rawPosition.push(tempVec3.clone());
    }
}
