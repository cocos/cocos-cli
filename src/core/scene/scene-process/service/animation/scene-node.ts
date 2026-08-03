import {
    Animation,
    Component,
    Node,
    Scene,
    SkeletalAnimation,
    animation,
    js,
} from 'cc';
import type { IAnimationValue } from '../../../common';
import { cloneValue } from './utils';
import {
    parseMaterialUniformPropertyKey,
    readMaterialUniformValue,
} from './material-uniform';

const NodeMgr = EditorExtends.Node;

export function getAnimationMode(editorType: 'scene' | 'prefab' | 'unknown') {
    if (editorType === 'scene') {
        return 'general';
    }
    if (editorType === 'prefab') {
        return 'prefab';
    }
    return 'unknown';
}

export function getNodeByUuid(uuid: string): Node | null {
    if (!uuid) {
        return null;
    }
    return NodeMgr.getNode(uuid) || null;
}

export function getNodeByPath(path: string): Node | null {
    if (!path || !NodeMgr.getNodeByPath) {
        return null;
    }
    return NodeMgr.getNodeByPath(path) || null;
}

export function getNodePath(node: Node): string {
    return NodeMgr.getNodePath?.(node) || '';
}

/**
 * Resolve both the unique system paths used by the CLI and the relative display paths stored in
 * animation tracks. If the same string resolves to different nodes in the two namespaces, the
 * path is ambiguous and the caller must provide a UUID instead.
 */
export function getNodeBySystemPath(rootNode: Node, rootPath: string, nodePath: string): Node | null {
    const normalizedRootPath = normalizeNodePath(rootPath);
    const normalizedNodePath = normalizeNodePath(nodePath);
    if (!normalizedNodePath) {
        return rootNode;
    }

    const isAbsolute = Boolean(
        normalizedRootPath
        && (normalizedNodePath === normalizedRootPath || normalizedNodePath.startsWith(`${normalizedRootPath}/`)),
    );
    const absolutePath = normalizedRootPath && !isAbsolute
        ? `${normalizedRootPath}/${normalizedNodePath}`
        : normalizedNodePath;
    const systemNode = getNodeByPath(absolutePath);

    // A path that already contains rootPath is explicitly an absolute system path. Do not reinterpret
    // a missing/stale absolute path as a display path, or it may bind to a different live node.
    if (isAbsolute) {
        return systemNode;
    }

    const relativePath = normalizedNodePath;
    const displayNode = relativePath ? findUniqueNodeByDisplayPath(rootNode, relativePath) : rootNode;

    if (systemNode && displayNode && systemNode.uuid !== displayNode.uuid) {
        return null;
    }
    return systemNode || displayNode;
}

function findUniqueNodeByDisplayPath(rootNode: Node, relativePath: string): Node | null {
    let current = rootNode;
    for (const segment of relativePath.split('/').filter(Boolean)) {
        const matches = current.children.filter((child) => child.name === segment);
        if (matches.length !== 1) {
            return null;
        }
        current = matches[0];
    }
    return current;
}

export function queryAnimationRootNode(node: Node, editorRoot: Node | null): Node {
    let current: Node | null = node;
    while (current) {
        if (queryAnimationComponent(current)) {
            return current;
        }
        if (current === editorRoot || current.parent instanceof Scene) {
            break;
        }
        current = current.parent;
    }
    return node;
}

export function queryAnimationComponent(node: Node): Animation | animation.AnimationController | null {
    const controllerCtor = (animation as any).AnimationController;
    const controller = controllerCtor ? node.getComponent(controllerCtor) : null;
    if (controller) {
        return controller as animation.AnimationController;
    }
    return node.getComponent(Animation);
}

export function isUsingBakedAnimation(rootNode: Node): boolean {
    const animComp = queryAnimationComponent(rootNode);
    return animComp instanceof SkeletalAnimation && Boolean(animComp.useBakedAnimation);
}

export function isSkeletonClip(uuid: string, rootNode?: Node | null): boolean {
    if (rootNode) {
        // A sub-asset UUID is not enough to identify a skeletal clip. Ordinary
        // imported AnimationClips use the same `@subAsset` UUID form.
        return Boolean(rootNode.getComponent(SkeletalAnimation));
    }
    return uuid.includes('@');
}

export function readPropertyValue(node: Node, propKey: string): unknown {
    const materialUniform = parseMaterialUniformPropertyKey(propKey);
    for (const component of node.components) {
        const names = getComponentNames(component);
        for (const name of names) {
            if (materialUniform && name === materialUniform.comp) {
                return readMaterialUniformValue(component as any, materialUniform);
            }
            const prefix = `${name}.`;
            if (name && propKey.startsWith(prefix)) {
                return readPathValue(component, propKey.slice(prefix.length));
            }
        }
    }

    return readPathValue(node, propKey);
}

export function extractSampledOperationValue(value: IAnimationValue, channel?: string): IAnimationValue {
    if (!channel) {
        return cloneValue(value);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return cloneValue((value as Record<string, IAnimationValue>)[channel]);
}

function getComponentNames(component: Component): string[] {
    const names = [
        js.getClassName(component),
        (component as any).__className,
        (component as any).constructor?.__className,
        (component as any).constructor?.name,
    ];
    return names.filter((name, index): name is string => typeof name === 'string' && name.length > 0 && names.indexOf(name) === index);
}

function readPathValue(target: unknown, path: string): unknown {
    if (!path) {
        return target;
    }

    let value = target as any;
    for (const key of path.split('.')) {
        if (value === null || value === undefined) {
            return undefined;
        }
        value = value[key];
    }
    return value;
}

function normalizeNodePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
