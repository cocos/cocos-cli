import { Asset } from '@editor/asset-db';
import { GltfpackOptions, GlTFUserData, MeshOptimizerOption } from '../../meta-schemas/glTF.meta';
import { i18nTranslate, linkToAssetTarget } from '../../utils';
import { GltfConverter, readGltf } from '../utils/gltf-converter';
import { validateGlTf } from './validation';
import fs, { existsSync, readJSON, stat } from 'fs-extra';
import { fork } from 'child_process';
import path from 'path';
import { GlobalPaths } from '../../../../../global';
import assetConfig from '../../../asset-config';
import { createFbxConverter } from '../utils/fbx-converter';
import { modelConvertRoutine } from '../utils/model-convert-routine';
import { fbxToGlTf } from './fbx-to-gltf';

class GlTfReaderManager {
    private _map = new Map<string, GltfConverter>();

    /**
     *
     * @param asset
     * @param injectBufferDependencies 是否当创建 glTF 转换器的时候同时注入 glTF asset 对其引用的 buffer 文件的依赖。
     */
    public async getOrCreate(asset: Asset, importVersion: string, injectBufferDependencies = false) {
        let result = this._map.get(asset.uuid);
        if (!result) {
            const { converter, referencedBufferFiles } = await createGlTfReader(asset, importVersion);
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

export async function getFbxFilePath(asset: Asset, importerVersion: string,) {
    const userData = asset.userData as GlTFUserData;
    if (typeof userData.fbx?.smartMaterialEnabled === 'undefined') {
        (userData.fbx ??= {}).smartMaterialEnabled = await assetConfig.getProject<boolean>('fbx.material.smart') ?? false;
    }
    let outGLTFFile: string;
    if (userData.legacyFbxImporter) {
        outGLTFFile = await fbxToGlTf(asset, asset._assetDB, importerVersion);
    } else {
        const options: Parameters<typeof createFbxConverter>[0] = {};
        options.unitConversion = userData.fbx?.unitConversion;
        options.animationBakeRate = userData.fbx?.animationBakeRate;
        options.preferLocalTimeSpan = userData.fbx?.preferLocalTimeSpan;
        options.smartMaterialEnabled = userData.fbx?.smartMaterialEnabled ?? false;
        options.matchMeshNames = userData.fbx?.matchMeshNames ?? true;
        const fbxConverter = createFbxConverter(options);
        const converted = await modelConvertRoutine('fbx.FBX-glTF-conv', asset, asset._assetDB, importerVersion, fbxConverter);
        if (!converted) {
            throw new Error(`Failed to import ${asset.source}`);
        }
        outGLTFFile = converted;
    }

    if (!userData.meshSimplify || !userData.meshSimplify.enable) {
        return outGLTFFile;
    }
    return await getOptimizerPath(asset, outGLTFFile, importerVersion, userData.meshSimplify);
}
export async function getGltfFilePath(asset: Asset, importerVersion: string) {
    const userData = asset.userData as GlTFUserData;
    if (!userData.meshSimplify || !userData.meshSimplify.enable) {
        return asset.source;
    }
    return await getOptimizerPath(asset, asset.source, importerVersion, userData.meshSimplify);
}

export function getOptimizerPath(asset: Asset, source: string, importerVersion: string, options: MeshOptimizerOption) {
    if (options.algorithm === 'gltfpack' && options.gltfpackOptions) {
        return _getOptimizerPath(asset, source, importerVersion, options.gltfpackOptions);
    }

    // 新的减面库直接在 mesh 子资源上处理
    return source;
}

/**
 * gltfpackOptions
 * @param asset
 * @param source
 * @param options
 * @returns
 */
async function _getOptimizerPath(asset: Asset, source: string, importerVersion: string, options: GltfpackOptions = {}): Promise<string> {
    const tmpDirDir = asset._assetDB.options.temp;
    const tmpDir = path.join(tmpDirDir, `gltfpack-${asset.uuid}`);
    fs.ensureDirSync(tmpDir);

    const out = path.join(tmpDir, 'out.gltf');
    const statusPath = path.join(tmpDir, 'status.json');

    const expectedStatus = {
        mtimeMs: (await stat(asset.source)).mtimeMs,
        version: importerVersion,
        options: JSON.stringify(options),
    };

    if (existsSync(out) && existsSync(statusPath)) {
        try {
            const json = await readJSON(statusPath);
            if (
                json.mtimeMs === expectedStatus.mtimeMs &&
                json.version === expectedStatus.version &&
                json.options === expectedStatus.options
            ) {
                return out;
            }
        } catch (error) { }
    }

    return new Promise((resolve) => {
        try {
            const cmd = path.join(GlobalPaths.workspace, 'node_modules/gltfpack/bin/gltfpack.js');

            const args = [
                '-i',
                source, // 输入 GLTF
                '-o',
                out, // 输出 GLTF
            ];

            const cVlaue = options.c;
            if (cVlaue === '1') {
                args.push('-c');
            } else if (cVlaue === '2') {
                args.push('-cc');
            }

            // textures
            if (options.te) {
                args.push('-te');
            } // 主缓冲
            if (options.tb) {
                args.push('-tb');
            } //
            if (options.tc) {
                args.push('-tc');
            }
            if (options.tq !== 50 && options.tq !== undefined) {
                args.push('-tq');
                args.push(options.tq);
            }
            if (options.tu) {
                args.push('-tu');
            }

            // simplification
            if (options.si !== 1 && options.si !== undefined) {
                args.push('-si');
                args.push(options.si);
            }
            if (options.sa) {
                args.push('-sa');
            }

            // vertices
            if (options.vp !== 14 && options.vp !== undefined) {
                args.push('-vp');
                args.push(options.vp);
            }
            if (options.vt !== 12 && options.vt !== undefined) {
                args.push('-vt');
                args.push(options.vt);
            }
            if (options.vn !== 8 && options.vn !== undefined) {
                args.push('-vn');
                args.push(options.vn);
            }

            // animation
            if (options.at !== 16 && options.at !== undefined) {
                args.push('-at');
                args.push(options.at);
            }
            if (options.ar !== 12 && options.ar !== undefined) {
                args.push('-ar');
                args.push(options.ar);
            }
            if (options.as !== 16 && options.as !== undefined) {
                args.push('-as');
                args.push(options.as);
            }
            if (options.af !== 30 && options.af !== undefined) {
                args.push('-af');
                args.push(options.af);
            }
            if (options.ac) {
                args.push('-ac');
            }

            // scene
            if (options.kn) {
                args.push('-kn');
            }
            if (options.ke) {
                args.push('-ke');
            }

            // miscellaneous
            if (options.cf) {
                args.push('-cf');
            }
            if (options.noq || options.noq === undefined) {
                args.push('-noq');
            }
            if (options.v || options.v === undefined) {
                args.push('-v');
            }
            // if (options.h) { args.push'-h'; }

            const child = fork(cmd, args);
            child.on('exit', async (code) => {
                // if (error) { console.error(`Error: ${error}`); }
                // if (stderr) { console.error(`Error: ${stderr}`); }
                // if (stdout) { console.log(`${stdout}`); }

                await fs.writeFile(statusPath, JSON.stringify(expectedStatus, undefined, 2));
                resolve(out);
            });
        } catch (error) {
            console.error(error);
            resolve(source);
        }
    });
}
async function createGlTfReader(asset: Asset, importVersion: string) {
    let getFileFun: Function;
    if (asset.meta.importer === 'fbx') {
        getFileFun = getFbxFilePath;
    } else {
        getFileFun = getGltfFilePath;
    }

    const glTfFilePath: string = await getFileFun(asset, importVersion);

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
