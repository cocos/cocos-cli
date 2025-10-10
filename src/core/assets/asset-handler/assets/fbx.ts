import { AssetHandlerBase } from '../../@types/protected';
import GltfHandler from './gltf';

export const FbxHandler: AssetHandlerBase = {
    ...GltfHandler,

    // Handler 的名字，用于指定 Handler as 等
    name: 'fbx',
};

export default FbxHandler;
