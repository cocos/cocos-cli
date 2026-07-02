import {
    Animation,
    AnimationClip,
    AnimationState,
    Node,
} from 'cc';
import type {
    AnimationEventReason,
    IAnimationClipDump,
    IAnimationClipEvent,
    IAnimationEnterOptions,
    IAnimationPropertyInfo,
    IAnimationQueryClipOptions,
    IAnimationQueryPropertyValueAtFrameOptions,
    IAnimationTargetOptions,
} from '../../../common';
import { createClipDump } from './clip-dump';
import type { IPropertyCurveMetadataContext } from './property-curve';
import { ACTIVE_PROPERTY, DEFAULT_PROPERTIES } from './property-menu';
import { queryAnimationPropertyMetadata, queryComponentAnimableProperties } from './property-metadata';
import {
    getNodeByPath,
    getNodeByUuid,
    isSkeletonClip,
    isUsingBakedAnimation,
    queryAnimationRootNode,
} from './scene-node';
import { IAnimationSession } from './types';
import { clipUuid } from './utils';

export function assertAnimationEditorOpened(editorRoot: Node | null): asserts editorRoot is Node {
    if (!editorRoot) {
        throw new Error('Animation editor requires an opened scene or prefab.');
    }
}

export function requireAnimationSession(session: IAnimationSession | null): IAnimationSession {
    if (!session) {
        throw new Error('Animation editing session is not active.');
    }
    return session;
}

export function resolveAnimationRootTarget(options: IAnimationTargetOptions, editorRoot: Node | null, selection: string[]): Node {
    const node = resolveAnimationTargetNode(options, editorRoot, selection);
    return options.rootPath || options.rootUuid ? node : queryAnimationRootNode(node, editorRoot);
}

export function resolveAnimationTargetNode(
    options: IAnimationTargetOptions | IAnimationEnterOptions,
    editorRoot: Node | null,
    selection: string[],
): Node {
    assertAnimationEditorOpened(editorRoot);
    const uuid = 'rootUuid' in options ? options.rootUuid : undefined;
    const path = 'rootPath' in options ? options.rootPath : undefined;
    const nodeUuid = 'nodeUuid' in options ? options.nodeUuid : undefined;
    const nodePath = 'nodePath' in options ? options.nodePath : undefined;
    const target = getNodeByUuid(uuid || nodeUuid || '') || getNodeByPath(path || nodePath || '');
    if (target) {
        return target;
    }

    if (selection.length > 0) {
        const selected = getNodeByPath(selection[0]);
        if (selected) {
            return selected;
        }
    }

    throw new Error('Animation target node is required.');
}

export function resolveAnimationFrameQueryNode(options: IAnimationQueryPropertyValueAtFrameOptions, session: IAnimationSession): Node {
    const nodeByUuid = getNodeByUuid(options.nodeUuid || '');
    if (nodeByUuid) {
        return nodeByUuid;
    }

    const path = options.nodePath || session.rootPath;
    const nodeByPath = getNodeByPath(path);
    if (nodeByPath) {
        return nodeByPath;
    }

    if (options.nodePath && !options.nodePath.startsWith(session.rootPath)) {
        const relativeNode = getNodeByPath(`${session.rootPath}/${options.nodePath}`);
        if (relativeNode) {
            return relativeNode;
        }
    }

    throw new Error(`Animation target node is required: ${path}`);
}

export function isCurrentAnimationSessionClipQuery(
    session: IAnimationSession | null,
    options: IAnimationQueryClipOptions,
    uuid: string,
    hasTarget: boolean,
): boolean {
    if (!session || uuid !== session.clipUuid) {
        return false;
    }
    if (!hasTarget) {
        return true;
    }
    return options.rootUuid === session.rootUuid
        || options.rootPath === session.rootPath
        || options.nodeUuid === session.rootUuid
        || options.nodePath === session.rootPath;
}

export function queryAnimationServiceProperties(node: Node, root: Node | null): IAnimationPropertyInfo[] {
    const isChild = Boolean(root && root !== node);
    const properties = isChild ? [ACTIVE_PROPERTY, ...DEFAULT_PROPERTIES] : [...DEFAULT_PROPERTIES];

    for (const comp of node.components) {
        if (!comp || comp instanceof Animation) {
            continue;
        }
        properties.push(...queryComponentAnimableProperties(comp));
    }

    return properties;
}

export function createAnimationServiceClipDump(rootNode: Node, clip: AnimationClip, state?: AnimationState): IAnimationClipDump {
    return createClipDump(clip, state, {
        isSkeleton: isSkeletonClip(clipUuid(clip), rootNode),
        useBakedAnimation: isUsingBakedAnimation(rootNode),
        queryPropertyMetadata: (nodePath, propKey) => queryAnimationPropertyMetadata(rootNode, nodePath, propKey),
    });
}

export function createAnimationPropertyCurveMetadataContext(rootNode: Node): IPropertyCurveMetadataContext {
    return {
        queryPropertyMetadata: (nodePath, propKey) => queryAnimationPropertyMetadata(rootNode, nodePath, propKey),
    };
}

export function createAnimationServiceClipEvent(session: IAnimationSession | null, reason: AnimationEventReason): IAnimationClipEvent | null {
    if (!session) {
        return null;
    }
    return {
        reason,
        rootUuid: session.rootUuid,
        rootPath: session.rootPath,
        clipUuid: session.clipUuid,
    };
}

export function getAnimationSessionRootNode(session: IAnimationSession): Node {
    const rootNode = getNodeByUuid(session.rootUuid);
    if (!rootNode) {
        throw new Error(`Animation root node not found: ${session.rootUuid}`);
    }
    return rootNode;
}
