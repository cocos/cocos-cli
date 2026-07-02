import {
    Animation,
    AnimationClip,
    Node,
    animation,
    assetManager as ccAssetManager,
} from 'cc';
import type {
    IAnimationClipMenuItem,
    IAnimationClipsInfo,
} from '../../../common';
import type { IAnimationData } from './types';
import { clipUuid } from './utils';
import { getNodePath, queryAnimationComponent } from './scene-node';

export async function queryNodeAnimationData(node: Node, preferredClipUuid?: string, options: { allowEmpty?: boolean; recoverClipBinding?: boolean } = {}): Promise<IAnimationData> {
    const animComp = queryAnimationComponent(node);
    if (!animComp) {
        throw new Error(`Animation component not found on node: ${getNodePath(node)}`);
    }

    let clips: AnimationClip[] = [];
    let defaultClip: AnimationClip | null = null;
    if (animComp instanceof Animation) {
        clips = (animComp.clips || []).filter((clip): clip is AnimationClip => Boolean(clip?.name));
        defaultClip = animComp.defaultClip || clips[0] || null;
        if (defaultClip?.name) {
            clips.push(defaultClip);
        }
    } else {
        clips = (await visitAnimationClipsInController(animComp))
            .filter((clip): clip is AnimationClip => Boolean(clip?.name));
        defaultClip = clips[0] || null;
    }

    clips = uniqAnimationClips(clips);
    if (!defaultClip?.name) {
        defaultClip = clips[0] || null;
    }
    if (options.recoverClipBinding && (clips.length === 0 || !defaultClip) && preferredClipUuid && animComp instanceof Animation) {
        const recoveredClip = await loadAnimationClip(preferredClipUuid);
        if (recoveredClip?.name) {
            rebindAnimationComponentClip(animComp, recoveredClip);
            clips = uniqAnimationClips((animComp.clips || []).filter((clip): clip is AnimationClip => Boolean(clip?.name)));
            defaultClip = animComp.defaultClip?.name ? animComp.defaultClip : clips[0] || null;
        }
    }
    if (clips.length === 0 || !defaultClip) {
        if (options.allowEmpty) {
            return { node, animComp, clips, defaultClip };
        }
        throw new Error(`Animation clips not found on node: ${getNodePath(node)}`);
    }

    return { node, animComp, clips, defaultClip };
}

export async function queryAnimationClipsInfo(rootNode: Node): Promise<IAnimationClipsInfo> {
    const animData = await queryNodeAnimationData(rootNode, undefined, { allowEmpty: true });
    return {
        rootUuid: rootNode.uuid,
        rootPath: getNodePath(rootNode),
        clipsMenu: decodeClipsMenu(animData.clips),
        defaultClip: clipUuid(animData.defaultClip),
    };
}

export function resolveAnimationClip(animData: IAnimationData, uuid?: string): AnimationClip {
    const targetUuid = uuid || clipUuid(animData.defaultClip);
    const clip = animData.clips.find((item) => clipUuid(item) === targetUuid);
    if (!clip) {
        throw new Error(`Animation clip not found: ${targetUuid}`);
    }
    return clip;
}

export function decodeClipsMenu(clips: AnimationClip[]): IAnimationClipMenuItem[] {
    return clips.map((clip) => ({
        uuid: clipUuid(clip),
        name: clip.name,
    }));
}

export function uniqAnimationClips(clips: AnimationClip[]): AnimationClip[] {
    const seen = new Set<string>();
    const result: AnimationClip[] = [];
    for (const clip of clips) {
        const uuid = clipUuid(clip);
        if (!uuid || seen.has(uuid)) {
            continue;
        }
        seen.add(uuid);
        result.push(clip);
    }
    return result;
}

export async function visitAnimationClipsInController(controller: animation.AnimationController): Promise<AnimationClip[]> {
    const system = (globalThis as any).System;
    if (system?.import) {
        const mod = await system.import('cc/editor/new-gen-anim');
        if (typeof mod?.visitAnimationClipsInController === 'function') {
            return Array.from(mod.visitAnimationClipsInController(controller) as Iterable<AnimationClip>);
        }
    }

    const mod = await import('cc/editor/new-gen-anim');
    if (typeof mod.visitAnimationClipsInController !== 'function') {
        throw new Error('visitAnimationClipsInController is not available.');
    }
    return Array.from(mod.visitAnimationClipsInController(controller) as Iterable<AnimationClip>);
}

export function rebindAnimationComponentClip(animComp: Animation, clip: AnimationClip): void {
    const uuid = clipUuid(clip);
    const currentDefaultUuid = animComp.defaultClip ? clipUuid(animComp.defaultClip) : '';
    let found = false;
    const clips = (animComp.clips || []).map((item) => {
        if (item && clipUuid(item) === uuid) {
            found = true;
            return clip;
        }
        return item;
    });
    if (!found) {
        clips.push(clip);
    }
    animComp.clips = clips;
    if (!currentDefaultUuid || currentDefaultUuid === uuid) {
        animComp.defaultClip = clip;
    }
}

export async function loadAnimationClip(uuid: string): Promise<AnimationClip | null> {
    const cached = ccAssetManager.assets.get(uuid);
    if (cached instanceof AnimationClip) {
        return cached;
    }

    return await new Promise((resolve, reject) => {
        ccAssetManager.loadAny(uuid, (error, asset: AnimationClip) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(asset instanceof AnimationClip ? asset : null);
        });
    });
}
