import { Asset } from '@editor/asset-db';
import { AssetHandlerBase } from '../../@types/protected';
import { GlTFUserData } from '../meta-schemas/glTF.meta';
import GltfHandler, { getOptimizerPath as getOptimizerPathInGltf } from './gltf';
import { fbxToGlTf } from './gltf/fbx-to-gltf';
import { createFbxConverter } from './utils/fbx-converter';
import { modelConvertRoutine } from './utils/model-convert-routine';
import profile from '../../../profile';

export const FbxHandler: AssetHandlerBase = {
    ...GltfHandler,

    // Handler 的名字，用于指定 Handler as 等
    name: 'fbx',
};

export default FbxHandler;

export async function getGltfFilePath(asset: Asset) {
    const userData = asset.userData as GlTFUserData;
    if (typeof userData.fbx?.smartMaterialEnabled === 'undefined') {
        (userData.fbx ??= {}).smartMaterialEnabled = await profile.getProject('project', 'fbx.material.smart') ?? false;
    }
    let outGLTFFile: string;
    if (userData.legacyFbxImporter) {
        outGLTFFile = await fbxToGlTf(asset, asset._assetDB, FbxHandler.importer.version);
    } else {
        const options: Parameters<typeof createFbxConverter>[0] = {};
        options.unitConversion = userData.fbx?.unitConversion;
        options.animationBakeRate = userData.fbx?.animationBakeRate;
        options.preferLocalTimeSpan = userData.fbx?.preferLocalTimeSpan;
        options.smartMaterialEnabled = userData.fbx?.smartMaterialEnabled ?? false;
        options.matchMeshNames = userData.fbx?.matchMeshNames ?? true;
        const fbxConverter = createFbxConverter(options);
        const converted = await modelConvertRoutine('fbx.FBX-glTF-conv', asset, asset._assetDB, FbxHandler.importer.version, fbxConverter);
        if (!converted) {
            throw new Error(`Failed to import ${asset.source}`);
        }
        outGLTFFile = converted;
    }

    if (!userData.meshSimplify || !userData.meshSimplify.enable) {
        return outGLTFFile;
    }
    return await getOptimizerPathInGltf(asset, outGLTFFile, userData.meshSimplify);
}
