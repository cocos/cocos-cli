import { Asset } from '@editor/asset-db';
import { GlTFUserData } from '../../meta-schemas/glTF.meta';
import { i18nTranslate, linkToAssetTarget } from '../../utils';
import { GltfConverter, readGltf } from '../utils/gltf-converter';
import { validateGlTf } from './validation';
import fs from 'fs-extra';
import GltfHandler, { getGltfFilePath } from '../gltf';
import { getGltfFilePath as getFbxFilePath } from '../fbx';

class GlTfReaderManager {
    private _map = new Map<string, GltfConverter>();

    /**
     *
     * @param asset
     * @param injectBufferDependencies 是否当创建 glTF 转换器的时候同时注入 glTF asset 对其引用的 buffer 文件的依赖。
     */
    public async getOrCreate(asset: Asset, injectBufferDependencies = false) {
        let result = this._map.get(asset.uuid);
        if (!result) {
            const { converter, referencedBufferFiles } = await createGlTfReader(asset);
            result = converter;
            this._map.set(asset.uuid, result);
            if (injectBufferDependencies) {
                for (const referencedBufferFile of referencedBufferFiles) {
                    asset.depend(referencedBufferFile);
                }
            }
        }
        return result;
    }

    public delete(asset: Asset) {
        this._map.delete(asset.uuid);
    }
}

export const glTfReaderManager = new GlTfReaderManager();

async function createGlTfReader(asset: Asset) {
    let getFileFun: Function;
    if (asset.meta.importer === 'fbx') {
        getFileFun = getFbxFilePath;
    } else {
        getFileFun = getGltfFilePath;
    }

    const glTfFilePath: string = await getFileFun(asset);

    const isConvertedGlTf = glTfFilePath !== asset.source; // TODO: Better solution?

    // Validate.
    const userData = asset.userData as GlTFUserData;
    const skipValidation = userData.skipValidation === undefined ? true : userData.skipValidation;
    if (!skipValidation) {
        await validateGlTf(glTfFilePath, asset.source);
    }

    // Create.
    const { glTF, buffers } = await readGltf(glTfFilePath);

    const referencedBufferFiles: string[] = [];
    const loadedBuffers = await Promise.all(
        buffers.map(async (buffer): Promise<Buffer> => {
            if (Buffer.isBuffer(buffer)) {
                return buffer;
            } else {
                if (!isConvertedGlTf) {
                    // TODO: Better solution?
                    referencedBufferFiles.push(buffer);
                }
                return await fs.readFile(buffer);
            }
        }),
    );

    function getRepOfGlTFResource(group: string, index: number) {
        if (!Array.isArray(glTF[group])) {
            return '';
        } else {
            let groupNameI18NKey: string;
            switch (group) {
                case 'meshes':
                    groupNameI18NKey = 'engine-extends.importers.glTF.glTF_asset_group_mesh';
                    break;
                case 'animations':
                    groupNameI18NKey = 'engine-extends.importers.glTF.glTF_asset_group_animation';
                    break;
                case 'nodes':
                    groupNameI18NKey = 'engine-extends.importers.glTF.glTF_asset_group_node';
                    break;
                case 'skins':
                    groupNameI18NKey = 'engine-extends.importers.glTF.glTF_asset_group_skin';
                    break;
                case 'samplers':
                    groupNameI18NKey = 'engine-extends.importers.glTF.glTF_asset_group_sampler';
                    break;
                default:
                    groupNameI18NKey = group;
                    break;
            }
            const asset = glTF[group][index];
            if (typeof asset.name === 'string' && asset.name) {
                return i18nTranslate('engine-extends.importers.glTF.glTF_asset', {
                    group: i18nTranslate(groupNameI18NKey),
                    name: asset.name,
                    index,
                });
            } else {
                return i18nTranslate('engine-extends.importers.glTF.glTF_asset_no_name', {
                    group: i18nTranslate(groupNameI18NKey),
                    index,
                });
            }
        }
    }

    const logger: GltfConverter.Logger = (level, error, args) => {
        let message: string | undefined;
        switch (error) {
            case GltfConverter.ConverterError.UnsupportedAlphaMode: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.UnsupportedAlphaMode];
                message = i18nTranslate('engine-extends.importers.glTF.unsupported_alpha_mode', {
                    material: getRepOfGlTFResource('materials', tArgs.material),
                    mode: tArgs.mode,
                });
                break;
            }
            case GltfConverter.ConverterError.UnsupportedTextureParameter: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.UnsupportedTextureParameter];
                message = i18nTranslate('engine-extends.importers.glTF.unsupported_texture_parameter', {
                    sampler: '',
                    texture: getRepOfGlTFResource('textures', tArgs.texture),
                    type: i18nTranslate(
                        tArgs.type === 'minFilter'
                            ? 'engine-extends.importers.glTF.min_filter'
                            : tArgs.type === 'magFilter'
                                ? 'engine-extends.importers.glTF.mag_filter'
                                : 'engine-extends.importers.glTF.wrapMode',
                    ),
                    value: '',
                });
                break;
            }
            case GltfConverter.ConverterError.UnsupportedChannelPath: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.UnsupportedChannelPath];
                message = i18nTranslate('engine-extends.importers.glTF.unsupported_channel_path', {
                    animation: getRepOfGlTFResource('animations', tArgs.animation),
                    channel: tArgs.channel,
                    path: tArgs.path,
                });
                break;
            }
            case GltfConverter.ConverterError.ReferenceSkinInDifferentScene: {
                const tArgs =
                    args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.ReferenceSkinInDifferentScene];
                message = i18nTranslate('engine-extends.importers.glTF.reference_skin_in_different_scene', {
                    node: getRepOfGlTFResource('nodes', tArgs.node),
                    skin: getRepOfGlTFResource('skins', tArgs.skin),
                });
                break;
            }
            case GltfConverter.ConverterError.DisallowCubicSplineChannelSplit: {
                const tArgs =
                    args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.DisallowCubicSplineChannelSplit];
                message = i18nTranslate('engine-extends.importers.glTF.disallow_cubic_spline_channel_split', {
                    animation: getRepOfGlTFResource('animations', tArgs.animation),
                    channel: tArgs.channel,
                });
                break;
            }
            case GltfConverter.ConverterError.FailedToCalculateTangents: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.FailedToCalculateTangents];
                message = i18nTranslate(
                    tArgs.reason === 'normal'
                        ? 'engine-extends.importers.glTF.failed_to_calculate_tangents_due_to_lack_of_normals'
                        : 'engine-extends.importers.glTF.failed_to_calculate_tangents_due_to_lack_of_uvs',
                    {
                        mesh: getRepOfGlTFResource('meshes', tArgs.mesh),
                        primitive: tArgs.primitive,
                    },
                );
                break;
            }
            case GltfConverter.ConverterError.EmptyMorph: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.EmptyMorph];
                message = i18nTranslate('engine-extends.importers.glTF.empty_morph', {
                    mesh: getRepOfGlTFResource('meshes', tArgs.mesh),
                    primitive: tArgs.primitive,
                });
                break;
            }
            case GltfConverter.ConverterError.UnsupportedExtension: {
                const tArgs = args as GltfConverter.ConverterErrorArgumentFormat[GltfConverter.ConverterError.UnsupportedExtension];
                message = i18nTranslate('engine-extends.importers.glTF.unsupported_extension', {
                    name: tArgs.name,
                    // required, // 是否在 glTF 里被标记为“必需”
                });
                break;
            }
        }

        const link = linkToAssetTarget(asset.uuid);
        switch (level) {
            case GltfConverter.LogLevel.Info:
            default:
                console.log(message, link);
                break;
            case GltfConverter.LogLevel.Warning:
                console.warn(message, link);
                break;
            case GltfConverter.LogLevel.Error:
                console.error(message, link);
                break;
            case GltfConverter.LogLevel.Debug:
                console.debug(message, link);
                break;
        }
    };

    const converter = new GltfConverter(glTF, loadedBuffers, glTfFilePath, {
        logger,
        userData: asset.userData as GlTFUserData,
        promoteSingleRootNode: (asset.userData as GlTFUserData)?.promoteSingleRootNode ?? false,
        generateLightmapUVNode: (asset.userData as GlTFUserData)?.generateLightmapUVNode ?? false,
    });

    return { converter, referencedBufferFiles };
}
