/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { animation, type AnimationClip, type Node } from 'cc';
import type { IAnimationOperation } from '../../../common';
import { getClipTracks, readTrackNodePath } from './property-curve-track';

type NodeDataOperation = Extract<IAnimationOperation, { type: 'changeNodeDataPath' }>;

/**
 * 判断路径是否可用于节点数据迁移
 *
 * 路径必须相对当前动画根节点；空字符串表示根节点
 */
export function isAnimationNodeDataPath(path: unknown): path is string {
    if (typeof path !== 'string') {
        return false;
    }
    return path === '' || path.split('/').every(
        segment => segment !== '' && segment !== '.' && segment !== '..',
    );
}

/**
 * 按相对路径查找唯一的迁移目标
 *
 * 空路径返回根节点；节点不存在或同名兄弟节点造成歧义时返回 null
 */
export function resolveNodeDataTarget(root: Node, path: string): Node | null {
    let node = root;
    for (const name of path === '' ? [] : path.split('/')) {
        const matches = node.children.filter(child => child.name === name);
        if (matches.length !== 1) {
            return null;
        }
        node = matches[0];
    }
    return node;
}

/**
 * 将源节点自身的全部普通轨道迁移到目标，并覆盖目标自身轨道
 *
 * 源节点允许丢失；不会迁移子节点、事件或播放器。无源数据及同路径操作不修改 Clip
 */
export function changeNodeDataPath(
    clip: AnimationClip,
    rootNode: Node,
    operation: NodeDataOperation,
): boolean {
    const { srcPath, dstPath } = operation;
    if (!isAnimationNodeDataPath(srcPath) || !isAnimationNodeDataPath(dstPath)) {
        throw new TypeError('Animation node data paths must be relative to the animation root.');
    }
    if (srcPath === dstPath) {
        return true;
    }
    if (!resolveNodeDataTarget(rootNode, dstPath)) {
        throw new Error(`Animation node data target does not exist or is ambiguous: "${dstPath}".`);
    }

    // 先准备源轨道的新路径，避免准备失败时已经覆盖目标数据
    const tracks = getClipTracks(clip);
    const moves: Array<{ track: animation.Track; path: animation.TrackPath }> = [];
    for (const track of tracks) {
        const { nodePath, propertyOffset } = readTrackNodePath(track.path);
        if (nodePath !== srcPath) {
            continue;
        }

        const path = new animation.TrackPath();
        if (dstPath) {
            path.toHierarchy(dstPath);
        }
        // 只替换层级前缀，保留组件、数组索引、属性路径和自定义代理
        path.append(track.path.slice(propertyOffset));
        moves.push({ track, path });
    }
    if (moves.length === 0) {
        return true;
    }

    // 覆盖目标自身轨道后再迁入源数据；写入异常由 AnimationService 的完整快照回滚
    for (let index = tracks.length - 1; index >= 0; index--) {
        if (readTrackNodePath(tracks[index].path).nodePath === dstPath) {
            clip.removeTrack(index);
        }
    }
    for (const { track, path } of moves) {
        track.path = path;
    }

    return true;
}
