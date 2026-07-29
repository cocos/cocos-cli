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


export function upgradeUntypedAnimationTracks(rootNode: Node, clip: AnimationClip): void {
    const upgradeUntypedTracks = (clip as AnimationClip & {
        upgradeUntypedTracks?: (refine: (path: any, proxy: unknown) => string | null) => void;
    }).upgradeUntypedTracks;
    if (typeof upgradeUntypedTracks !== 'function') {
        return;
    }

    upgradeUntypedTracks.call(clip, (path: any) => {
        const target = readAnimationTrackTarget(path);
        if (!target) {
            return null;
        }

        const metadata = queryAnimationPropertyMetadata(rootNode, target.nodePath, target.propKey);
        const type = metadata?.type.value ?? defaultAnimationPropertyType(target.propKey);
        switch (type) {
            case 'cc.Vec2':
                return 'vec2';
            case 'cc.Vec3':
                return 'vec3';
            case 'cc.Vec4':
                return 'vec4';
            case 'cc.Color':
                return 'color';
            case 'cc.Size':
                return 'size';
            default:
                return null;
        }
    });
}

function readAnimationTrackTarget(path: any): { nodePath: string; propKey: string } | null {
    if (!path || typeof path.length !== 'number') {
        return null;
    }

    let index = 0;
    let nodePath = '';
    while (index < path.length && path.isHierarchyAt(index)) {
        const segment = String(path.parseHierarchyAt(index) || '').replace(/^\/+|\/+$/g, '');
        if (segment) {
            nodePath = nodePath ? `${nodePath}/${segment}` : segment;
        }
        index++;
    }

    let component: string | undefined;
    if (index < path.length && path.isComponentAt(index)) {
        component = path.parseComponentAt(index);
        index++;
    }
    if (index !== path.length - 1 || !path.isPropertyAt(index)) {
        return null;
    }

    const property = path.parsePropertyAt(index);
    return { nodePath, propKey: component ? `${component}.${property}` : property };
}

function defaultAnimationPropertyType(propKey: string): string | undefined {
    switch (propKey) {
        case 'position':
        case 'eulerAngles':
        case 'scale':
            return 'cc.Vec3';
        default:
            return undefined;
    }
}

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

    if (options.nodePath) {
        const path = options.nodePath;
        if (path === session.rootPath || path.startsWith(`${session.rootPath}/`)) {
            const nodeByPath = getNodeByPath(path);
            if (nodeByPath) {
                return nodeByPath;
            }
        }

        const relativeNode = getNodeByPath(`${session.rootPath}/${path}`);
        if (relativeNode) {
            return relativeNode;
        }

        const nodeByPath = getNodeByPath(path);
        if (nodeByPath) {
            return nodeByPath;
        }
    } else {
        const rootNode = getNodeByPath(session.rootPath);
        if (rootNode) {
            return rootNode;
        }
    }

    throw new Error(`Animation target node is required: ${options.nodePath || session.rootPath}`);
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
    const sessionRootPath = normalizeTargetPath(session.rootPath);
    const optionRootPath = normalizeTargetPath(options.rootPath || '');
    const optionNodePath = normalizeTargetPath(options.nodePath || '');
    return options.rootUuid === session.rootUuid
        || (options.rootPath !== undefined && optionRootPath === sessionRootPath)
        || options.nodeUuid === session.rootUuid
        || (options.nodePath !== undefined && optionNodePath === sessionRootPath);
}

function normalizeTargetPath(path: string): string {
    return String(path || '').replace(/^\/+|\/+$/g, '');
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
    upgradeUntypedAnimationTracks(rootNode, clip);
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
