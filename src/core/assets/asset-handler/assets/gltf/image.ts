import * as DataURI from '@cocos/data-uri';
import { Asset, VirtualAsset } from '@editor/asset-db';
import fs, { outputFile } from 'fs-extra';
import ps, { join } from 'path';
import URI from 'urijs';
import URL from 'url';
import { convertHDROrEXR, convertPSD, convertTGA } from '../image/image-mics';
import { convertsEncodedSeparatorsInURI } from '../utils/uri-utils';
import { glTfReaderManager } from './reader-manager';
import { i18nTranslate, linkToAssetTarget } from '../../utils';
import { matchImageTypePattern } from '../utils/match-image-type-pattern';
import { imageMimeTypeToExt } from '../utils/image-mime-type-to-ext';
import { decodeBase64ToArrayBuffer } from '../utils/base64';
import { ImageAsset } from 'cc';
import { getDependUUIDList } from '../../utils';
import { defaultIconConfig, handleImageUserData } from '../image/utils';
import { AssetHandler } from '../../../@types/protected';

export const GltfImageHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'gltf-embeded-image',

    // 引擎内对应的类型
    assetType: 'cc.ImageAsset',
    iconInfo: {
        default: defaultIconConfig,
        generateThumbnail(asset: Asset) {
            return {
                type: 'image',
                value: asset.library + asset.getData('imageExtName'),
            };
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.3',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: VirtualAsset) {
            if (!asset.parent) {
                return false;
            }

            const imageIndex = asset.userData.gltfIndex as number;
            const gltfConverter = await glTfReaderManager.getOrCreate(asset.parent as Asset);
            const glTFImage = gltfConverter.gltf.images![imageIndex];

            // The `mimeType` is the mime type which is recorded on or deduced from transport layer.
            let image: { data: Buffer; mimeType?: string; extName?: string } | undefined;

            const tryLoadFile = async (fileURL: string) => {
                try {
                    const imagePath = URL.fileURLToPath(fileURL);
                    const imageData = await fs.readFile(imagePath);
                    // https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#file-extensions-and-mime-types
                    // > Implementations should use the image type pattern matching algorithm
                    // > from the MIME Sniffing Standard to detect PNG and JPEG images as file extensions
                    // > may be unavailable in some contexts.
                    const mimeType = matchImageTypePattern(imageData);
                    image = { data: imageData, mimeType, extName: ps.extname(imagePath) };
                } catch (error) {
                    console.error(
                        i18nTranslate('engine-extends.importers.glTF.failed_to_load_image', {
                            url: fileURL,
                            reason: error,
                        }),
                        linkToAssetTarget(asset.uuid),
                    );
                }
            };

            const resolved = asset.getSwapSpace<{ resolved?: string }>().resolved;
            if (resolved) {
                const fileURL = URL.pathToFileURL(resolved);
                await tryLoadFile(fileURL.href);
            } else {
                if (glTFImage.bufferView !== undefined) {
                    image = {
                        data: gltfConverter.readImageInBufferView(gltfConverter.gltf.bufferViews![glTFImage.bufferView]),
                    };
                } else if (glTFImage.uri !== undefined) {
                    // Note: should not be `asset.parent.source`, which may be path to fbx.
                    const glTFFilePath = gltfConverter.path;

                    const badURI = (error: any) => {
                        console.error(`The uri "${glTFImage.uri}" provided by model file${glTFFilePath} is not correct: ${error}`);
                    };

                    if (glTFImage.uri.startsWith('data:')) {
                        try {
                            const dataURI = DataURI.parse(glTFImage.uri);
                            if (!dataURI) {
                                throw new Error(`Unable to parse data uri "${glTFImage.uri}"`);
                            }
                            image = resolveImageDataURI(dataURI);
                        } catch (error) {
                            badURI(error);
                        }
                    } else {
                        // Note: should not be `asset.parent.source`, which may be path to fbx.
                        const glTFFilePath = gltfConverter.path;
                        let imageURI: string | undefined;
                        try {
                            const baseURI = URL.pathToFileURL(glTFFilePath).toString();
                            let uriObj = new URI(glTFImage.uri);
                            uriObj = uriObj.absoluteTo(baseURI);
                            convertsEncodedSeparatorsInURI(uriObj);
                            imageURI = uriObj.toString();
                        } catch (error) {
                            badURI(error);
                        }

                        if (imageURI) {
                            if (!imageURI.startsWith('file://')) {
                                console.error(
                                    i18nTranslate('engine-extends.importers.glTF.image_uri_should_be_file_url'),
                                    linkToAssetTarget(asset.uuid),
                                );
                            } else {
                                await tryLoadFile(imageURI);
                            }
                        }
                    }
                }
            }

            const imageAsset = new ImageAsset();
            if (image) {
                let extName: string | undefined;
                // Note, we prefer to use `mimeType` to detect image type and
                // reduce to use the possible `extName` if mime type is not available or is some we can't process.
                // https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#images
                // > When image data is provided by uri and mimeType is defined,
                // > client implementations should prefer JSON-defined MIME Type over one provided by transport layer.
                const mimeType = glTFImage.mimeType ?? image.mimeType;
                if (mimeType) {
                    extName = imageMimeTypeToExt(mimeType);
                }
                if (!extName) {
                    extName = image.extName;
                }
                if (!extName) {
                    throw new Error('Unknown image type');
                }
                let imageData: Buffer | string = image.data;
                if (extName.toLowerCase() === '.tga') {
                    const converted = await convertTGA(imageData);
                    if (converted instanceof Error || !converted) {
                        console.error(i18nTranslate('engine-extends.importers.glTF.failed_to_convert_tga'), linkToAssetTarget(asset.uuid));
                        return false;
                    }
                    extName = converted.extName;
                    imageData = converted.data;
                } else if (extName.toLowerCase() === '.psd') {
                    const converted = await convertPSD(imageData);
                    ({ extName, data: imageData } = converted);
                } else if (extName.toLowerCase() === '.exr') {
                    const tempFile = join(asset.temp, `image${extName}`);
                    await outputFile(tempFile, imageData);
                    // TODO 需要与 image/index 整合复用 https://github.com/cocos/3d-tasks/issues/19092
                    const converted = await convertHDROrEXR(extName, tempFile, asset.uuid, asset.temp);
                    if (converted instanceof Error || !converted) {
                        console.error(i18nTranslate('engine-extends.importers.glTF.failed_to_convert_tga'), linkToAssetTarget(asset.uuid));
                        return false;
                    }
                    extName = converted.extName;
                    imageData = converted.source;
                }
                imageAsset._setRawAsset(extName);
                asset.userData.fixAlphaTransparencyArtifacts = true;
                // 和imageImport保持一致 cocos/3d-tasks#13641
                imageData = await handleImageUserData(asset, imageData, extName);
                await asset.saveToLibrary(extName, imageData);
                asset.setData('imageExtName', extName);
            }

            const serializeJSON = EditorExtends.serialize(imageAsset);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default GltfImageHandler;

function resolveImageDataURI(uri: DataURI.DataURI): { data: Buffer; mimeType: string } {
    if (!uri.base64 || !uri.mediaType || uri.mediaType.type !== 'image') {
        throw new Error(`Cannot understand data uri(base64: ${uri.base64}, mediaType: ${uri.mediaType}) for image.`);
    }
    const data = decodeBase64ToArrayBuffer(uri.data);
    return {
        data: Buffer.from(data),
        mimeType: uri.mediaType.value,
    };
}
