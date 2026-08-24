import {
    AnimationClip,
    Node,
} from 'cc';
import { Rpc } from '../../rpc';
import { isSkeletonClip } from './scene-node';
import { saveSkeletonAnimationMeta } from './skeleton-meta';
import type { IAnimationSession } from './types';

export async function saveAnimationServiceClip(options: {
    session: IAnimationSession;
    rootNode: Node;
    clip: AnimationClip;
    target?: string;
}): Promise<boolean> {
    const { session, rootNode, clip, target } = options;
    if (target) {
        if (isSkeletonClip(session.clipUuid, rootNode)) {
            throw new Error('Save As is not supported for skeletal animation clips.');
        }

        const content = EditorExtends.serialize(clip);
        const assetInfo = await Rpc.getInstance().request('assetManager', 'createAsset', [{
            target,
            content,
            overwrite: true,
        }]);
        if (!assetInfo) {
            throw new Error(`Animation clip Save As failed: ${target}`);
        }
        return true;
    }

    if (isSkeletonClip(session.clipUuid, rootNode)) {
        await saveSkeletonAnimationMeta(session.clipUuid, clip);
        return true;
    }

    const content = EditorExtends.serialize(clip);
    const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [session.clipUuid]);
    if (!assetInfo) {
        throw new Error(`Animation clip asset not found: ${session.clipUuid}`);
    }
    await Rpc.getInstance().request('assetManager', 'saveAsset', [assetInfo.uuid, content]);
    return true;
}
