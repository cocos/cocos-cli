import { VirtualAsset } from '@editor/asset-db';

export async function changeImageDefaultType(imageAsset: VirtualAsset | null, type: string) {
    if (!imageAsset) {
        return;
    }
    // 如果同时导入，image 还在导入，则把 image 的类型改为 sprite-frame
    if (imageAsset.imported === false && imageAsset.init === false && imageAsset.task > 0) {
        imageAsset.userData.type = type;
    }
}
