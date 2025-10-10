import { Asset, queryPath, queryUrl, queryUUID } from '@editor/asset-db';
import { AssertionError } from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';
import URI from 'urijs';
import URL from 'url';
import { Animation, Material, Mesh, Skin } from '../../@types/glTF';
import { DefaultGltfAssetFinder, MyFinderKind } from './gltf/asset-finder';
import { dumpMaterial } from './gltf/material';
import { glTfReaderManager } from './gltf/reader-manager';
import { GltfConverter, GltfSubAsset } from './utils/gltf-converter';

import {
    AnimationImportSetting,
    GlTFUserData,
    ImageMeta,
    LODsOption,
} from '../meta-schemas/glTF.meta';
import * as migratesNameToId from './migrates/name2id';
import { convertsEncodedSeparatorsInURI } from './utils/uri-utils';
import { IGltfAnimationUserData } from './gltf/animation';
import { AnimationClip, MeshRenderer, Node } from 'cc';

import { existsSync, readJSON, stat } from 'fs-extra';

import { resolveGlTfImagePath } from './utils/resolve-glTF-image-path';
import { serializeForLibrary } from './utils/serialize-library';
import { getOriginalAnimationLibraryPath } from './gltf/original-animation';
import { isAbsolute, relative, sep } from 'path';

import { getDependUUIDList } from '../utils';
import { getDefaultSimplifyOptions } from './gltf/meshSimplify';
import { AssetHandler, AssetHandlerBase } from '../../@types/protected';
import { fork } from 'child_process';
import { makeDefaultTexture2DAssetUserData } from './image/utils';
import { Texture2DAssetUserData } from '../../@types/userDatas';
import assetQuery from '../../manager/query';
import assetConfig from '../../asset-config';
import { GlobalPaths } from '../../../../global';

const lodash = require('lodash');

// const ajv = new Ajv({
//     errorDataPath: '',
// });
// const schemaFile = path.join(__dirname, '..', '..', '..', 'dist', 'meta-schemas', 'glTF.meta.json');
// const schema = fs.readJSONSync(schemaFile);
// const metaValidator = ajv.compile(schema);

export const GltfHandler: AssetHandlerBase = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'gltf',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '2.3.14',
        versionCode: 3,

        /**
         * 数据迁移
         */
        migrations: [
            {
                version: '1.1.21',
                migrate(asset: Asset) {
                    delete (asset.meta.userData as GlTFUserData).assetFinder;
                },
            },
            {
                version: '1.1.23',
                migrate: migratesNameToId.migrate,
            },
            {
                version: '1.3.0',
                migrate: migrateImageLocations,
            },
            {
                version: '1.3.21',
                migrate: migrateDumpMaterial,
            },
            {
                version: '2.0.0',
                migrate: migrateFbxConverterSelector,
            },
            {
                version: '2.0.8',
                migrate: migrateFbxConverterUnitConversion,
            },
            {
                version: '2.1.9',
                migrate: migrateFbxConverterPreferLocalTimeSpan,
            },
            {
                version: '2.2.0',
                migrate: migrateSmartMaterialEnabled,
            },
            {
                version: '2.3.0',
                migrate: migrateFBXPromoteSingleRootNode,
            },
            {
                version: '2.3.2',
                migrate: migrateMeshOptimizerOption,
            },
            {
                version: '2.3.5',
                migrate: migrateImageRemap,
            },
            {
                version: '2.3.7',
                migrate: migrateFbxMatchMeshNames,
            },
            {
                version: '2.3.12',
                migrate: migrateMeshSimplifyOption,
            },
            {
                version: '2.3.13',
                migrate(asset: Asset) {
                    delete asset.meta.userData.redirect;
                },
            },
        ],

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: Asset) {
            await validateMeta(asset);
            return await importSubAssets(asset, this.version);
        },
        async afterSubAssetsImport(asset: Asset) {
            await glTfReaderManager.delete(asset);
        },
    },
};
export default GltfHandler;

async function validateMeta(asset: Asset) {
    // asset.meta.userData.imageMetas ??= [];
    // const metaValidation = await metaValidator(asset.meta.userData);
    // if (!metaValidation) {
    //     if (Object.keys(asset.meta.userData).length !== 0) {
    //         console.debug(
    //             'Meta file of asset ' +
    //             asset.source +
    //             ' is damaged: \n' +
    //             (metaValidator.errors || []).map((error) => error.message) +
    //             '\nA default meta file is patched.',
    //         );
    //     }
    const defaultMeta: GlTFUserData = {
        imageMetas: [],
        legacyFbxImporter: false,
        allowMeshDataAccess: true,
        addVertexColor: false,
        generateLightmapUVNode: false,
        meshOptimizer: {
            enable: false,
            algorithm: 'simplify',
            simplifyOptions: getDefaultSimplifyOptions(),
        },
        lods: {
            enable: false,
            hasBuiltinLOD: false,
            options: [],
        },
    };
    // TODO 由于目前资源界面编辑的部分默认值是自行编写的，很容易出现此类默认值有缺失的情况，补齐即可
    asset.meta.userData = lodash.defaultsDeep(asset.meta.userData, defaultMeta);
}

async function importSubAssets(asset: Asset, importVersion: string) {
    // Create the converter
    glTfReaderManager.delete(asset);
    const gltfConverter = await glTfReaderManager.getOrCreate(asset, importVersion, true);

    await adjustMeta(asset, gltfConverter);

    const userData = asset.userData as GlTFUserData;

    const gltfAssetFinder = new DefaultGltfAssetFinder(userData.assetFinder);

    // 导入 glTF 网格。
    const meshUUIDs = await importMeshes(asset, gltfConverter);
    gltfAssetFinder.set('meshes', meshUUIDs);

    // 保存所有原始动画（未分割）
    await saveOriginalAnimations(asset, gltfConverter, true);

    // 导入 glTF 动画。
    const { animationImportSettings } = userData;
    if (animationImportSettings) {
        for (const animationSetting of animationImportSettings) {
            for (const split of animationSetting.splits) {
                const { previousId, name, from, to, fps, ...remain } = split;
                const subAsset = await asset.createSubAsset(`${name}.animation`, 'gltf-animation', {
                    id: previousId,
                });
                split.previousId = subAsset._id;
                const subAssetUserData = subAsset.userData as IGltfAnimationUserData;
                subAssetUserData.gltfIndex = animationImportSettings.indexOf(animationSetting);
                Object.assign(subAssetUserData, remain);
                subAssetUserData.sample = fps ?? animationSetting.fps;
                subAssetUserData.span = {
                    from,
                    to,
                };
            }
        }
    }

    // 导入 glTF 皮肤。
    const skinUUIDs = await importSkins(asset, gltfConverter);
    gltfAssetFinder.set('skeletons', skinUUIDs);

    // 导入 glTF 图像。
    await importImages(asset, gltfConverter);

    // 导入 glTF 贴图。
    const textureUUIDs = await importTextures(asset, gltfConverter);
    gltfAssetFinder.set('textures', textureUUIDs);

    // 导入 glTF 材质。
    const materialUUIDs = await importMaterials(asset, gltfConverter, gltfAssetFinder);
    gltfAssetFinder.set('materials', materialUUIDs);

    // 导入 glTF 场景。
    const sceneUUIDs = await importScenes(asset, gltfConverter);
    gltfAssetFinder.set('scenes', sceneUUIDs);

    // 第一次导入，设置是否 fbx 自带 lod，是否开启
    if (sceneUUIDs.length && (!userData.lods || !userData.lods.options || !userData.lods.options.length)) {
        const assetMeta = assetQuery.queryAssetMeta(sceneUUIDs[gltfConverter.gltf.scene || 0]);
        if (assetMeta) {
            // 获取节点信息
            const sceneNode = gltfConverter.createScene(assetMeta.userData.gltfIndex || 0, gltfAssetFinder);
            const builtinLODsOption = await loadLODs(userData, sceneNode, gltfConverter);
            const hasLODs = builtinLODsOption.length > 0;
            userData.lods = {
                enable: hasLODs,
                hasBuiltinLOD: hasLODs,
                options: hasLODs ? builtinLODsOption : await generateDefaultLODsOption(),
            };
        }
    }

    if (userData.dumpMaterials && !materialUUIDs.every((uuid) => uuid !== null)) {
        console.debug('Waiting for dependency materials...');
        return false;
    }
    // 保存 AssetFinder。
    userData.assetFinder = gltfAssetFinder.serialize();

    return true;
}

async function adjustMeta(asset: Asset, glTFConverter: GltfConverter) {
    const meta = asset.userData as GlTFUserData;

    const glTFImages = glTFConverter.gltf.images;
    if (!glTFImages) {
        meta.imageMetas = [];
    } else {
        const oldImageMetas = meta.imageMetas;
        const imageMetas = glTFImages.map((glTFImage: any, index: any) => {
            const imageMeta: ImageMeta = {};
            if (glTFImage.name) {
                // If the image has name, we find old remap according the name.
                imageMeta.name = glTFImage.name;
                if (oldImageMetas) {
                    const oldImageMeta = oldImageMetas.find((remap) => remap.remap && remap.name && remap.name === imageMeta.name);
                    if (oldImageMeta) {
                        imageMeta.remap = oldImageMeta.remap;
                    }
                }
            } else if (
                oldImageMetas &&
                glTFImages.length === oldImageMetas.length &&
                !oldImageMetas[index].name &&
                oldImageMetas[index].remap
            ) {
                // Otherwise, if the remaps count are same, and the corresponding old remap also has no name,
                // we can suppose they are for the same image.
                imageMeta.remap = oldImageMetas[index].remap;
            }
            return imageMeta;
        });
        meta.imageMetas = imageMetas;
    }

    const glTFAnimations = glTFConverter.gltf.animations;
    if (!glTFAnimations) {
        delete meta.animationImportSettings;
    } else {
        // 尝试从旧的动画设置中读取数据。
        const oldAnimationImportSettings = meta.animationImportSettings || [];
        const splitNames = makeUniqueSubAssetNames(asset.basename, glTFAnimations, 'animations', '');
        const newAnimationImportSettings = glTFAnimations.map((gltfAnimation: any, animationIndex: any) => {
            const duration = glTFConverter.getAnimationDuration(animationIndex);
            const splitName = gltfAnimation.name || splitNames[animationIndex];
            let defaultSplitName = splitName;
            if (glTFAnimations.length === 1) {
                const baseNameNoExt = path.basename(asset.basename, path.extname(asset.basename));
                const parts = baseNameNoExt.split('@');
                if (parts.length > 1) {
                    defaultSplitName = parts[parts.length - 1];
                }
            }
            const animationSetting: AnimationImportSetting = {
                name: splitName,
                duration,
                fps: 30,
                splits: [
                    {
                        name: defaultSplitName,
                        from: 0,
                        to: duration,
                        wrapMode: AnimationClip.WrapMode.Loop,
                    },
                ],
            };
            let oldAnimationSetting = oldAnimationImportSettings.find(
                (oldImportSetting) => oldImportSetting.name === animationSetting.name,
            );
            if (!oldAnimationSetting && oldAnimationImportSettings.length === gltfAnimation.length) {
                oldAnimationSetting = oldAnimationImportSettings[animationIndex];
            }
            if (oldAnimationSetting) {
                animationSetting.fps = oldAnimationSetting.fps;
                const tryAdjust = (oldTime: number) => {
                    if (oldTime === oldAnimationSetting!.duration) {
                        // A little opt.
                        return duration;
                    } else {
                        // It should not exceed the new duration.
                        return Math.min(oldTime, duration);
                    }
                };
                animationSetting.splits = oldAnimationSetting.splits.map((split): AnimationImportSetting['splits'][0] => {
                    // We are trying to adjust the previous split
                    // to ensure the split range always falling in new range [0, duration].
                    return {
                        ...split,
                        from: tryAdjust(split.from),
                        to: tryAdjust(split.to),
                        wrapMode: split.wrapMode ?? AnimationClip.WrapMode.Loop,
                    };
                });
            }
            return animationSetting;
        });
        meta.animationImportSettings = newAnimationImportSettings;
    }
}

async function importMeshes(asset: Asset, glTFConverter: GltfConverter) {
    const glTFMeshes = glTFConverter.gltf.meshes;
    if (glTFMeshes === undefined) {
        return [];
    }
    const assetNames = makeUniqueSubAssetNames(asset.basename, glTFMeshes, 'meshes', '.mesh');
    const meshArray = [];
    for (let index = 0; index < glTFMeshes.length; index++) {
        const glTFMesh = glTFMeshes[index];
        const subAsset = await asset.createSubAsset(assetNames[index], 'gltf-mesh');
        subAsset.userData.gltfIndex = index;
        meshArray.push(subAsset.uuid);
    }
    // 添加新的 mesh 子资源
    const userData = asset.userData as GlTFUserData;
    if (userData.lods && !userData.lods.hasBuiltinLOD && userData.lods.enable) {
        for (let index = 0; index < assetNames.length; index++) {
            const lodsOption = userData.lods.options;
            // LOD0 不需要生成处理
            for (let keyIndex = 1; keyIndex < lodsOption.length; keyIndex++) {
                // 新 mesh 子资源名称
                const newSubAssetName = assetNames[index].split('.mesh')[0] + `LOD${keyIndex}.mesh`;
                const newSubAsset = await asset.createSubAsset(newSubAssetName, 'gltf-mesh');
                // 记录一些新 mesh 子资源数据
                newSubAsset.userData.gltfIndex = index;
                newSubAsset.userData.lodLevel = keyIndex;
                newSubAsset.userData.lodOptions = {
                    faceCount: lodsOption[keyIndex].faceCount,
                };
                meshArray.push(newSubAsset.uuid);
            }
        }
    }
    return meshArray;
}

async function importSkins(asset: Asset, glTFConverter: GltfConverter) {
    const glTFSkins = glTFConverter.gltf.skins;
    if (glTFSkins === undefined) {
        return [];
    }
    const assetNames = makeUniqueSubAssetNames(asset.basename, glTFSkins, 'skeletons', '.skeleton');
    const skinArray = new Array(glTFSkins.length);
    for (let index = 0; index < glTFSkins.length; index++) {
        const glTFSkin = glTFSkins[index];
        const subAsset = await asset.createSubAsset(assetNames[index], 'gltf-skeleton');
        subAsset.userData.gltfIndex = index;
        skinArray[index] = subAsset.uuid;
    }
    return skinArray;
}

async function importImages(asset: Asset, glTFConverter: GltfConverter) {
    const glTFImages = glTFConverter.gltf.images;
    if (glTFImages === undefined) {
        return;
    }

    const userData = asset.userData as GlTFUserData;

    const fbxMissingImageUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const isProducedByFBX2glTF = () => {
        const generator = glTFConverter.gltf.asset.generator;
        return generator?.includes('FBX2glTF');
    };

    const isFBX2glTFSourceMissingImageUri = (uri: string) => {
        return isProducedByFBX2glTF() && uri === fbxMissingImageUri;
    };

    const isProducedByFbxGlTfConv = () => {
        const generator = glTFConverter.gltf.asset.generator;
        return generator?.includes('FBX-glTF-conv');
    };

    const isFBXGlTfConvMissingImageUri = (uri: string) => {
        return isProducedByFbxGlTfConv() && uri === fbxMissingImageUri;
    };

    const imageNames = makeUniqueSubAssetNames(asset.basename, glTFImages, 'images', '.image');
    for (let index = 0; index < glTFImages.length; ++index) {
        const glTFImage = glTFImages[index];
        const imageMeta = userData.imageMetas[index];
        const vendorURI = glTFImage.uri;

        let isResolveNeeded = false;
        // If isResolvedNeeded is `true`, the resolve algorithm will take this parameter.
        // There may be `isResolveNeeded && !imagePath`, see below.
        let imagePath: string | undefined;

        // We will not create sub-asset-Handler if:
        // - `uri` field is relative or is file URL, and
        // - the resolved absolute file path, after the image lookup rules applied is inside the project.
        // In such cases, we directly use this location instead of create the image asset.
        if (vendorURI && (isFBX2glTFSourceMissingImageUri(vendorURI) || isFBXGlTfConvMissingImageUri(vendorURI))) {
            // Note, if the glTF is converted from FBX by FBX2glTF
            // and there are missing textures, the FBX2glTF will assign a constant data-uri as uri of image.
            // We capture these cases and try resolve the image according the glTF image asset name
            // using our own algorithm.
            isResolveNeeded = true;
        } else if (vendorURI && !vendorURI.startsWith('data:')) {
            // Note: should not be `asset.source`, which may be path to fbx.
            const glTFFilePath = glTFConverter.path;
            const baseURI = URL.pathToFileURL(glTFFilePath).toString();
            try {
                let normalizedURI = new URI(vendorURI);
                normalizedURI = normalizedURI.absoluteTo(baseURI);
                convertsEncodedSeparatorsInURI(normalizedURI);
                if (normalizedURI.scheme() === 'file') {
                    imagePath = URL.fileURLToPath(normalizedURI.toString());
                    isResolveNeeded = true;
                }
            } catch { }
        }

        let resolved = '';
        if (isResolveNeeded) {
            const resolveJail = asset._assetDB.options.target;
            const resolvedImagePath = await resolveGlTfImagePath(
                glTFImage.name,
                imagePath,
                path.dirname(asset.source),
                glTFImage.extras,
                resolveJail,
            );
            if (resolvedImagePath) {
                const dbURL = queryUrl(resolvedImagePath);
                if (dbURL) {
                    // In asset database, use it.
                    imageMeta.uri = dbURL;
                } else {
                    // This is happened usually when
                    // - 1. Model file contains absolute URL point to an out-of-project location;
                    // - 2. Model file contains relative URL but resolved to an out-of-project location;
                    // - 3. FBX model file and its reference images are converted using FBX2glTF to a temporary path.
                    // This location may be only able accessed by current-user.
                    // 1 & 2 hurts if project are shared by multi-user.
                    const relativeFromTmpDir = relative(assetConfig.data.tempRoot, resolvedImagePath);
                    if (!isAbsolute(relativeFromTmpDir) && !relativeFromTmpDir.startsWith(`..${sep}`)) {
                        resolved = resolvedImagePath;
                    } else {
                        console.warn(
                            `In model file ${asset.source},` +
                            `the image ${glTFImage.name} is resolved to ${resolvedImagePath},` +
                            'which is a location out of asset directory.' +
                            'This can cause problem as your project migrated.',
                        );
                    }
                }
            }
        }

        if (!imageMeta.uri) {
            const subAsset = await asset.createSubAsset(imageNames[index], 'gltf-embeded-image');
            subAsset.userData.gltfIndex = index;
            imageMeta.uri = subAsset.uuid;
            if (resolved) {
                subAsset.getSwapSpace<{ resolved?: string }>().resolved = resolved;
            } else {
                if (glTFImage.uri === fbxMissingImageUri) {
                    glTFConverter.fbxMissingImagesId.push(index);
                }
            }
        }
    }
}

async function importTextures(asset: Asset, glTFConverter: GltfConverter): Promise<Array<string | null>> {
    const glTFTextures = glTFConverter.gltf.textures;
    if (glTFTextures === undefined) {
        return [];
    }
    const assetNames = makeUniqueSubAssetNames(asset.basename, glTFTextures, 'textures', '.texture');
    const textureArray = new Array(glTFTextures.length);
    for (let index = 0; index < glTFTextures.length; index++) {
        const glTFTexture = glTFTextures[index];
        const name = assetNames[index];
        const subAsset = await asset.createSubAsset(name, 'texture');
        const defaultTextureUserdata = makeDefaultTexture2DAssetUserData();
        // 这里只是设置一个默认值，如果用户修改过，或者已经生成过数据，我们需要尽量保持存储在用户 meta 里的数据
        glTFConverter.getTextureParameters(glTFTexture, defaultTextureUserdata);
        const textureUserdata = subAsset.userData as Texture2DAssetUserData;
        subAsset.assignUserData(defaultTextureUserdata);
        if (glTFTexture.source !== undefined) {
            const imageMeta = (asset.userData as GlTFUserData).imageMetas[glTFTexture.source];
            const imageURI = imageMeta.remap || imageMeta.uri;
            if (!imageURI) {
                delete textureUserdata.imageUuidOrDatabaseUri;
                delete textureUserdata.isUuid;
            } else {
                const isUuid = !imageURI.startsWith('db://');
                textureUserdata.isUuid = isUuid;
                textureUserdata.imageUuidOrDatabaseUri = imageURI;
                if (!isUuid) {
                    const imagePath = queryPath(textureUserdata.imageUuidOrDatabaseUri);
                    if (!imagePath) {
                        throw new AssertionError({
                            message: `${textureUserdata.imageUuidOrDatabaseUri} is not found in asset-db.`,
                        });
                    }
                    subAsset.depend(imagePath);
                }
            }
        }
        textureArray[index] = subAsset.uuid;
    }
    return textureArray;
}

async function importMaterials(
    asset: Asset,
    glTFConverter: GltfConverter,
    assetFinder: DefaultGltfAssetFinder,
): Promise<Array<string | null>> {
    const glTFMaterials = glTFConverter.gltf.materials;
    if (glTFMaterials === undefined) {
        return [];
    }
    const { dumpMaterials } = asset.userData as GlTFUserData;
    const assetNames = makeUniqueSubAssetNames(asset.basename, glTFMaterials, 'materials', dumpMaterials ? '.mtl' : '.material');
    const materialArray = new Array(glTFMaterials.length);
    for (let index = 0; index < glTFMaterials.length; index++) {
        // const glTFMaterial = glTFMaterials[index];
        if (dumpMaterials) {
            materialArray[index] = await dumpMaterial(asset, assetFinder, glTFConverter, index, assetNames[index]);
        } else {
            const subAsset = await asset.createSubAsset(assetNames[index], 'gltf-material');
            subAsset.userData.gltfIndex = index;
            materialArray[index] = subAsset.uuid;
        }
    }
    return materialArray;
}

async function importScenes(asset: Asset, glTFConverter: GltfConverter): Promise<Array<string>> {
    const glTFScenes = glTFConverter.gltf.scenes;
    if (glTFScenes === undefined) {
        return [];
    }
    let id = '';
    if (asset.uuid2recycle) {
        for (const cID in asset.uuid2recycle) {
            const item = asset.uuid2recycle[cID];
            if (item.importer === 'gltf-scene' && 'id' in item) {
                id = cID;
            }
        }
    }
    const assetNames = makeUniqueSubAssetNames(asset.basename, glTFScenes, 'scenes', '.prefab');
    const sceneArray = new Array(glTFScenes.length);
    for (let index = 0; index < glTFScenes.length; index++) {
        const subAsset = await asset.createSubAsset(assetNames[index], 'gltf-scene', {
            id,
        });
        subAsset.userData.gltfIndex = index;
        sceneArray[index] = subAsset.uuid;
    }
    return sceneArray;
}

async function saveOriginalAnimations(asset: Asset, glTFConverter: GltfConverter, compress: boolean) {
    const glTFAnimations = glTFConverter.gltf.animations;
    if (!glTFAnimations) {
        return;
    }
    await Promise.all(
        glTFAnimations.map(async (_: any, iAnimation: any) => {
            const animation = glTFConverter.createAnimation(iAnimation);
            // if (compress) {
            //     compressAnimationClip(animation);
            // }
            const { data, extension } = serializeForLibrary(animation);
            const libraryPath = getOriginalAnimationLibraryPath(iAnimation);

            // @ts-expect-error
            await asset.saveToLibrary(libraryPath, data);

            const depends = getDependUUIDList(data);
            asset.setData('depends', depends);
        }),
    );
}

type Importlet = (asset: Mesh | Animation | Skin | Material, index: number, name: string) => Promise<string | null>;

// lod 配置最多层级
const maxLodLevel = 7;

// 默认 lod 层级的
const defaultLODsOptions = {
    screenRatio: 0,
    faceCount: 0,
};

// 递归查询节点下所有 mesh 的减面数
async function deepFindMeshRenderer(node: Node, glTFConverter: GltfConverter, lodLevel: number, generateLightmapUVNode?: boolean) {
    const meshRenderers = node.getComponents(MeshRenderer);
    let meshRendererTriangleCount = 0;
    if (meshRenderers && meshRenderers.length > 0) {
        for (const meshRenderer of meshRenderers) {
            if (meshRenderer.mesh && meshRenderer.mesh.uuid) {
                let meshTriangleCount = 0;
                const meshMeta = assetQuery.queryAssetMeta(meshRenderer.mesh.uuid);
                // 如果 fbx 自身含有 lod，meshMeta 里记录相应的 lod 层级
                meshMeta!.userData.lodLevel = lodLevel;
                // 获取 mesh 面数
                const mesh = glTFConverter.createMesh(meshMeta!.userData.gltfIndex, generateLightmapUVNode);
                mesh.struct.primitives?.forEach((subMesh: any) => {
                    if (subMesh && subMesh.indexView) {
                        meshTriangleCount += subMesh.indexView.count;
                    }
                });
                meshRendererTriangleCount += meshTriangleCount / 3;
            }
        }
    }
    if (node.children && node.children.length > 0) {
        for (const childNode of node.children) {
            const childCount: number = await deepFindMeshRenderer(childNode, glTFConverter, lodLevel, generateLightmapUVNode);
            return meshRendererTriangleCount + childCount;
        }
    }
    return meshRendererTriangleCount;
}

async function loadLODs(gltfUserData: GlTFUserData, sceneNode: Node, gltfConverter: GltfConverter) {
    const LODsOptionArr: LODsOption[] = [];
    const triangleCounts: number[] = [];
    // 获取模型以 LOD# 结尾的节点，计算 lod 层级节点下的所有 mesh 的减面数总和
    for (const child of sceneNode.children) {
        const lodArr = /LOD(\d+)$/i.exec(child.name);
        if (lodArr && lodArr.length > 1) {
            const index = parseInt(lodArr[1], 10);
            // 只取 7 层
            if (index <= maxLodLevel) {
                LODsOptionArr[index] = LODsOptionArr[index] || Object.assign({}, defaultLODsOptions);
                triangleCounts[index] =
                    (triangleCounts[index] || 0) +
                    (await deepFindMeshRenderer(child, gltfConverter, index, gltfUserData.generateLightmapUVNode));
            }
        }
    }

    if (LODsOptionArr.length > 0) {
        const maxLod = Math.max(...Object.keys(LODsOptionArr).map((key: string) => +key));
        // 屏占比从 0.25 逐级减半
        let screenRatio = 0.25;
        for (let index = 0; index < maxLod; index++) {
            // 填充 LOD 层级，maxLod 层级肯定存在
            if (!LODsOptionArr[index]) {
                console.debug(`No mesh name are ending with LOD${index}`);
                LODsOptionArr[index] = Object.assign({}, defaultLODsOptions);
            }

            // 计算 screenRatio faceCount
            LODsOptionArr[index].screenRatio = screenRatio;
            screenRatio /= 2;
            // 每个层级 triangle 和 LOD0 的比值
            if (triangleCounts[0] !== 0) {
                LODsOptionArr[index].faceCount = triangleCounts[index] / triangleCounts[0];
            }
        }
        // screenRatio 最后一层小于 1%，以计算结果为准。如果大于1，则用 1% 作为最后一个层级的屏占比
        LODsOptionArr[maxLod].screenRatio = screenRatio < 0.01 ? screenRatio : 0.01;
        LODsOptionArr[maxLod].faceCount = triangleCounts[0] ? triangleCounts[maxLod] / triangleCounts[0] : 0;
    }

    return LODsOptionArr;
}

async function generateDefaultLODsOption() {
    const LODsOptionArr: LODsOption[] = [];
    // 生成默认 screenRatio faceCount
    const defaultScreenRatioArr = [0.25, 0.125, 0.01],
        defaultFaceCountArr = [1, 0.25, 0.1];
    for (let index = 0; index < 3; index++) {
        LODsOptionArr[index] = {
            screenRatio: defaultScreenRatioArr[index],
            faceCount: defaultFaceCountArr[index],
        };
    }
    return LODsOptionArr;
}

/**
 * 为glTF子资源数组中的所有子资源生成在子资源数组中独一无二的名字，这个名字可用作EditorAsset的名称以及文件系统上的文件名。
 * @param gltfFileBaseName glTF文件名，不含扩展名部分。
 * @param assetsArray glTF子资源数组。
 * @param extension 附加的扩展名。该扩展名将作为后缀附加到结果名字上。
 * @param options.preferedFileBaseName 尽可能地使用glTF文件本身的名字而不是glTF子资源本身的名称来生成结果。
 */
function makeUniqueSubAssetNames(
    gltfFileBaseName: string,
    assetsArray: GltfSubAsset[],
    finderKind: MyFinderKind | 'images',
    extension: string,
) {
    const getBaseNameIfNoName = () => {
        switch (finderKind) {
            case 'animations':
                return 'UnnamedAnimation';
            case 'images':
                return 'UnnamedImage';
            case 'meshes':
                return 'UnnamedMesh';
            case 'materials':
                return 'UnnamedMaterial';
            case 'skeletons':
                return 'UnnamedSkeleton';
            case 'textures':
                return 'UnnamedTexture';
            default:
                return 'Unnamed';
        }
    };

    let names = assetsArray.map((asset) => {
        let unchecked: string | undefined;
        if (finderKind === 'scenes') {
            unchecked = gltfFileBaseName;
        } else if (typeof asset.name === 'string') {
            unchecked = asset.name;
        } else {
            unchecked = getBaseNameIfNoName();
        }
        return unchecked;
    });

    if (!isDifferWithEachOther(names as string[])) {
        let tail = '-';
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-line
            if (names.every((name) => !name!.endsWith(tail))) {
                // eslint-disable-line
                break;
            }
            tail += '-';
        }
        names = names.map((name, index) => name + `${tail}${index}`);
    }

    return names.map((name) => name + extension);
}

function isDifferWithEachOther(values: string[]) {
    if (values.length >= 2) {
        const sorted = values.slice().sort();
        for (let i = 0; i < sorted.length - 1; ++i) {
            if (sorted[i] === sorted[i + 1]) {
                return false;
            }
        }
    }
    return true;
}

async function migrateImageLocations(asset: Asset) {
    interface ImageDetail {
        uuidOrDatabaseUri: string;
        embeded: boolean;
    }

    interface OldMeta {
        imageLocations?: Record<
            string,
            {
                // 模型文件中该图片的路径信息。
                originalPath?: string | null;

                // 用户设置的图片路径，Database-url 形式。
                targetDatabaseUrl: string | null;
            }
        >;

        assetFinder?: {
            images?: Array<ImageDetail | null>;
        };
    }

    const oldMeta = asset.meta.userData as OldMeta;
    const imageMetas: ImageMeta[] = [];
    if (oldMeta.imageLocations) {
        const { imageLocations } = oldMeta;
        for (const imageName of Object.keys(imageLocations)) {
            const imageLocation = imageLocations[imageName];
            if (imageLocation.targetDatabaseUrl) {
                imageMetas.push({
                    name: imageName,
                    remap: imageLocation.targetDatabaseUrl,
                });
            }
        }
        delete oldMeta.imageLocations;
    }
    (asset.meta.userData as GlTFUserData).imageMetas = imageMetas;

    if (oldMeta.assetFinder && oldMeta.assetFinder.images) {
        delete oldMeta.assetFinder.images;
    }
}

async function migrateImageRemap(asset: Asset) {
    const oldMeta = asset.meta.userData as GlTFUserData;
    if (!oldMeta.imageMetas) {
        return;
    }
    for (const imageMeta of oldMeta.imageMetas) {
        const { remap } = imageMeta;
        if (!remap) {
            continue;
        }

        const uuid = queryUUID(remap);
        if (!uuid) {
            continue;
        } else {
            imageMeta.remap = uuid;
        }
    }
}
/**
 * 如果使用了 dumpMaterial，并且生成目录带有 FBX
 * 就需要改名，并重新导入新的 material
 * @param asset gltf 资源
 */
async function migrateDumpMaterial(asset: Asset) {
    if (!asset.userData.dumpMaterials || asset.userData.materialDumpDir) {
        return;
    }
    const old = path.join(asset.source, `../Materials${asset.basename}.FBX`);
    const oldMeta = path.join(asset.source, `../Materials${asset.basename}.FBX.meta`);
    const current = path.join(asset.source, `../Materials${asset.basename}`);
    const currentMeta = path.join(asset.source, `../Materials${asset.basename}.meta`);
    if (fs.existsSync(old) && !fs.existsSync(current)) {
        fs.renameSync(old, current);
        if (fs.existsSync(oldMeta)) {
            fs.renameSync(oldMeta, currentMeta);
        }
        asset._assetDB.refresh(current);
    }
}

/**
 * 从 FBX 导入器 2.0 开始，新增了 `legacyFbxHandler` 字段用来确定是
 * 使用旧的 `FBX2glTF` 还是 `FBX-glTF-conv`。
 * 当低于 2.0 版本的资源迁移上来时，默认使用旧版本的。
 * 但是所有新资源的创建将使用新版本的。
 */
async function migrateFbxConverterSelector(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    (asset.userData as GlTFUserData).legacyFbxImporter = true;
}

/**
 * FBX 导入器 v1.0.0-alpha.12 开始引入了 `--unit-conversion` 选项，并且默认使用了 `geometry-level`，
 * 而之前使用的是 `hierarchy-level`。
 *
 * @param asset
 */
async function migrateFbxConverterUnitConversion(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    const userData = asset.userData as GlTFUserData;
    if (userData.legacyFbxImporter) {
        return;
    }
    // @ts-ignore
    (userData.fbx ??= {}).unitConversion = 'hierarchy-level';
}

/**
 * FBX 导入器 v1.0.0-alpha.27 开始引入了 `--prefer-local-time-span` 选项，并且默认使用了 `true`，
 * 而之前使用的是 `false`。
 *
 * @param asset
 */
async function migrateFbxConverterPreferLocalTimeSpan(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    const userData = asset.userData as GlTFUserData;
    if (userData.legacyFbxImporter) {
        return;
    }
    // @ts-ignore
    (userData.fbx ??= {}).preferLocalTimeSpan = false;
}

/**
 * FBX 导入器 3.5.1 引入了 `smartMaterialEnabled` 属性,这个属性在旧版本的资源中是默认关闭的.
 *
 * @param asset
 */
async function migrateSmartMaterialEnabled(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    const userData = asset.userData as GlTFUserData;
    (userData.fbx ??= {}).smartMaterialEnabled = false;
}

/**
 * 在 3.6.x，glTF 也需要增加 `promoteSingleRootNode` 选项。所以我们把之前专属于 FBX 的直接迁移过来。
 * 见：https://github.com/cocos/cocos-engine/issues/11858
 */
async function migrateFBXPromoteSingleRootNode(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    // 迁移前的 UserData 数据格式
    const userData = asset.userData as Omit<GlTFUserData, 'fbx'> & {
        fbx?: NonNullable<GlTFUserData['fbx']> & {
            promoteSingleRootNode?: boolean;
        };
    };
    if (userData.fbx?.promoteSingleRootNode) {
        userData.promoteSingleRootNode = userData.fbx.promoteSingleRootNode;
        delete userData.fbx.promoteSingleRootNode;
    }
}

/**
 * 3.7.0 引入了新的减面算法，选项与之前完全不同，需要对字段存储做调整
 * @param asset
 */
export function migrateMeshOptimizerOption(asset: Asset) {
    const userData = asset.userData as GlTFUserData;
    // 使用过原来的减面算法，先保存数据，再移除旧数据
    if (!userData.meshOptimizer) {
        return;
    }
    userData.meshOptimizer = {
        algorithm: 'gltfpack',
        enable: true,
        // @ts-ignore
        gltfpackOptions: userData.meshOptimizerOptions || {},
    };
    // 直接移除旧数据
    // @ts-ignore
    delete userData.meshOptimizerOptions;
}

export function migrateFbxMatchMeshNames(asset: Asset) {
    if (asset.extname !== '.fbx') {
        return;
    }
    const userData = asset.userData as GlTFUserData;
    (userData.fbx ??= {}).matchMeshNames = false;
}

/**
 * 3.8.1 引入了新的减面选项，需要对字段存储做调整
 */
export function migrateMeshSimplifyOption(asset: Asset) {
    const userData = asset.userData as GlTFUserData;
    // 使用过原来的减面算法，先保存数据，再移除旧数据
    if (!userData.meshOptimizer) {
        return;
    }

    const optimizer = userData.meshOptimizer;
    const options = optimizer.simplifyOptions;

    userData.meshSimplify = {
        enable: optimizer.enable,
        targetRatio: options?.targetRatio || 1,
    };

    delete userData.meshOptimizer;
}
