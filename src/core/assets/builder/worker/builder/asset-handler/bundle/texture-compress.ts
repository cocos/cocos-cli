import { existsSync, copy, remove } from 'fs-extra';
import { basename, join } from 'path';
import { buildAssetLibrary } from '../../manager/asset-library';
import { TextureCompress } from '../texture-compress';
import { IBundle } from '../../../../@types/protected';
import { BuilderAssetCache } from '../../manager/asset';

export function bundleDataTask(bundle: IBundle, imageCompressManager: TextureCompress) {
    bundle.assetsWithoutRedirect.forEach((uuid) => {
        const assetInfo = buildAssetLibrary.getAsset(uuid);
        const task = imageCompressManager.addTaskWithAssetInfo(assetInfo);
        if (task) {
            bundle.compressTask[assetInfo.uuid] = task;
        }
    });

    console.debug(`init image compress task ${Object.keys(bundle.compressTask).length} in bundle ${bundle.name}`);
}

export async function bundleOutputTask(bundle: IBundle, cache: BuilderAssetCache) {
    await Promise.all(Object.keys(bundle.compressTask).map(async (uuid) => {
        const task = bundle.compressTask[uuid];
        if (!task.dest || !task.dest.length) {
            // 需要移除任务记录，后续将以此判断压缩任务是否被有效执行
            delete bundle.compressTask[uuid];
            return;
        }
        const realSuffix: string[] = [];
        bundle.compressRes[uuid] = [];
        await Promise.all(task.dest.map(async (path, index) => {
            if (!existsSync(path)) {
                return;
            }
            const dest = join(bundle.dest, bundle.nativeBase, uuid.substr(0, 2), basename(path));
            await copy(path, dest);

            realSuffix.push(task.suffix[index]);
            bundle.compressRes[uuid].push(dest);
        }));

        // 写入新增 instance , 后续进行 json 处理的时候，就能带上这个数据了
        const assetInstance = await cache.getInstance(uuid);
        assetInstance._exportedExts = realSuffix.sort();
        cache.addInstance(assetInstance);
    }));
}