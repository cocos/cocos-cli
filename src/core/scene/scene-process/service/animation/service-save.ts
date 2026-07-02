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
}): Promise<boolean> {
    const { session, rootNode, clip } = options;
    if (isSkeletonClip(session.clipUuid, rootNode)) {
        await saveSkeletonAnimationMeta(session.clipUuid, clip);
        return true;
    }

    const content = EditorExtends.serialize(clip);
    const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [session.clipUuid]);
    if (assetInfo) {
        await Rpc.getInstance().request('assetManager', 'saveAsset', [assetInfo.uuid, content]);
    } else {
        await Rpc.getInstance().request('assetManager', 'createAsset', [{
            target: `db://assets/${clip.name}.anim`,
            content,
        }]);
    }
    return true;
}
