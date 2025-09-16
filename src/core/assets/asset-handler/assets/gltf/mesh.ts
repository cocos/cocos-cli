import { Asset, VirtualAsset } from '@editor/asset-db';
import { glTfReaderManager } from './reader-manager';
import { getDependUUIDList } from '../../utils';
import { GlTFUserData, IVirtualAssetUserData } from '../../meta-schemas/glTF.meta';
import { gfx } from 'cc';
import fs from 'fs-extra';
import { unwrapLightmapUV } from '../utils/uv-unwrap';
import { ensureDir } from 'fs-extra';
import { AssetHandler, ThumbnailInfo } from '../../../@types/protected';
import { optimizeMesh, clusterizeMesh, simplifyMesh, getDefaultSimplifyOptions, compressMesh } from './meshOptimizer';

export const GltfMeshHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'gltf-mesh',

    // 引擎内对应的类型
    assetType: 'cc.Mesh',

    iconInfo: {
        default: {
            type: 'icon',
            value: 'gltf-mesh',
        },
        async generateThumbnail(asset: Asset) {
            const result: ThumbnailInfo = {
                type: 'icon',
                value: 'gltf-mesh',
            };

            // TODO: 实现生成 mesh 的缩略图
            return result;
        },
    },

    /**
     * 允许这种类型的资源进行实例化
     */
    instantiation: '.mesh',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.1.1',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: VirtualAsset) {
            // This could not happen
            if (!asset.parent) {
                return false;
            }
            // Fetch the gltf convert associated with parent (gltf)asset
            const gltfConverter = await glTfReaderManager.getOrCreate(asset.parent as Asset);
            const generateLightmapUV = (asset.parent.userData as GlTFUserData).generateLightmapUVNode;
            const gltfUserData = asset.parent.userData as GlTFUserData;
            const assetUserData = asset.userData as IVirtualAssetUserData;

            // Create the mesh asset
            let mesh = gltfConverter.createMesh(
                asset.userData.gltfIndex as number,
                generateLightmapUV,
                gltfUserData.addVertexColor ?? false,
            );
            // 新增的 mesh 需要进行减面
            if (assetUserData.lodOptions) {
                const defaultOption = getDefaultSimplifyOptions();
                defaultOption.targetRatio = assetUserData.lodOptions.faceCount;
                mesh = await simplifyMesh(mesh, defaultOption);
            }
            // 记录 mesh 的面数
            let meshTriangleCount = 0;
            assetUserData.triangleCount = 0;
            mesh.struct.primitives?.forEach((subMesh: any) => {
                if (subMesh && subMesh.indexView) {
                    meshTriangleCount += subMesh.indexView.count / 3;
                }
            });
            assetUserData.triangleCount = meshTriangleCount;

            mesh.allowDataAccess = (asset.parent.userData as GlTFUserData).allowMeshDataAccess ?? true;
            if (generateLightmapUV) {
                let hasUV1 = false;
                const vArray: number[] = [],
                    iArray: number[] = [];
                //Write out vb and ib
                let subMeshStartIndex = 0;
                for (let iSubMesh = 0; iSubMesh < mesh.struct.primitives.length; iSubMesh++) {
                    const vPosArray = mesh.readAttribute(iSubMesh, gfx.AttributeName.ATTR_POSITION) as Float32Array;
                    let indexArray;
                    if (mesh.struct.vertexBundles[iSubMesh].view.stride === 2) {
                        indexArray = mesh.readIndices(iSubMesh) as Uint16Array;
                    } else if (mesh.struct.vertexBundles[iSubMesh].view.stride === 4) {
                        indexArray = mesh.readIndices(iSubMesh) as Uint32Array;
                    } else {
                        console.warn('Invalid indeces stride');
                        indexArray = [];
                    }
                    for (let i = 0; i < vPosArray.length; ++i) {
                        vArray.push(vPosArray[i]);
                    }
                    for (let i = 0; i < indexArray.length; ++i) {
                        iArray.push(indexArray[i] + subMeshStartIndex);
                    }
                    if (mesh.readAttribute(iSubMesh, gfx.AttributeName.ATTR_TEX_COORD1)) {
                        hasUV1 = true;
                    }
                    subMeshStartIndex += mesh.struct.vertexBundles[iSubMesh].view.count;
                }
                const totalVertex = vArray.length / 3;
                const total = new Uint8Array(8 + vArray.length * 4 + iArray.length * 4);
                const vInt32ptr = new Int32Array(total.buffer, 0);
                vInt32ptr[0] = totalVertex;
                vInt32ptr[1] = iArray.length;
                const vPosFlt32ptr = new Float32Array(total.buffer, 8);
                const idxInt32Ptr = new Int32Array(total.buffer, 8 + vArray.length * 4);
                for (let i = 0; i < vArray.length; i++) {
                    vPosFlt32ptr[i] = vArray[i];
                }
                for (let i = 0; i < iArray.length; i++) {
                    idxInt32Ptr[i] = iArray[i];
                }
                //save out file.
                const fileName = asset.uuid;
                const folderToSave = asset.temp;
                await ensureDir(folderToSave);
                await fs.promises.writeFile(`${folderToSave}/${fileName}_in.bin`, total);
                await unwrapLightmapUV(`${folderToSave}/${fileName}_in.bin`, `${folderToSave}/${fileName}_out.bin`);
                const f2 = await fs.promises.readFile(`${folderToSave}/${fileName}_out.bin`);
                const bData = new Uint8Array(f2);
                const vPositionArr = new Float32Array(bData.buffer, 4);
                let index = 0;
                for (let iSubMesh = 0; iSubMesh < mesh.struct.primitives.length; iSubMesh++) {
                    const lightmapUV = mesh.readAttribute(iSubMesh, gfx.AttributeName.ATTR_TEX_COORD1) as Float32Array;
                    const attrs = mesh.struct.vertexBundles[iSubMesh].attributes;
                    let uvOffset = 0;
                    if (lightmapUV.length > 0) {
                        for (let i = 0; i < attrs.length; i++) {
                            if (attrs[i].name === gfx.AttributeName.ATTR_TEX_COORD1) {
                                break;
                            } else {
                                const fInfo = mesh.readAttributeFormat(iSubMesh, attrs[i].name as gfx.AttributeName);
                                if (fInfo) {
                                    uvOffset += fInfo.size;
                                }
                            }
                        }
                        if (uvOffset > 0) {
                            for (let i = 0; i < mesh.struct.vertexBundles[iSubMesh].view.count; i++) {
                                const tOffset =
                                    mesh.struct.vertexBundles[iSubMesh].view.offset +
                                    uvOffset +
                                    i * mesh.struct.vertexBundles[iSubMesh].view.stride;
                                const view = new DataView(mesh.data.buffer);
                                view.setFloat32(tOffset, vPositionArr[index], true);
                                view.setFloat32(tOffset + 4, vPositionArr[index + 1], true);
                                index += 2;
                            }
                        }
                    }
                }
            }

            // simplify pass
            if (gltfUserData.meshSimplify && gltfUserData.meshSimplify.enable) {
                mesh = await simplifyMesh(mesh, gltfUserData.meshSimplify);
            }

            // optimize pass
            if (gltfUserData.meshOptimize && gltfUserData.meshOptimize.enable) {
                mesh = await optimizeMesh(mesh, gltfUserData.meshOptimize);
            }

            // cluster pass
            if (gltfUserData.meshCluster && gltfUserData.meshCluster.enable) {
                mesh = await clusterizeMesh(mesh, gltfUserData.meshCluster);
            }

            // compress pass
            if (gltfUserData.meshCompress && gltfUserData.meshCompress.enable) {
                mesh = await compressMesh(mesh, gltfUserData.meshCompress);
            }

            if (mesh.data.byteLength !== 0) {
                // Do not create an empty file for empty binary data
                mesh._setRawAsset('.bin');
                await asset.saveToLibrary('.bin', Buffer.from(mesh.data));
            }

            // Save the mesh asset into library
            const serializeJSON = EditorExtends.serialize(mesh);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default GltfMeshHandler;
