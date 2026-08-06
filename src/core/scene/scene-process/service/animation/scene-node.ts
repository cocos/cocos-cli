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
    if (!path) {
        return null;
    }
    return NodeMgr.getNodeByPath(path) || null;
}

export function getNodePath(node: Node): string {
    return NodeMgr.getNodePath(node) || '';
}

export function resolveAnimationRelativeNodePath(
    rootNode: Node,
    rootPath: string,
    target: { nodePath?: string; nodeUuid?: string },
): string | null {
    if (target.nodeUuid) {
        const relativePath = findRelativeNodePathByUuid(rootNode, target.nodeUuid);
        if (relativePath === null) {
            return null;
        }
        const boundNode = relativePath ? rootNode.getChildByPath(relativePath) : rootNode;
        return boundNode?.uuid === target.nodeUuid ? relativePath : null;
    }

    const nodePath = normalizeNodePath(target.nodePath || '');
    if (!nodePath) {
        return '';
    }

    const normalizedRootPath = normalizeNodePath(rootPath);
    if (nodePath === normalizedRootPath) {
        return '';
    }

    if (normalizedRootPath && nodePath.startsWith(`${normalizedRootPath}/`)) {
        const relativePath = nodePath.slice(normalizedRootPath.length + 1);
        const animationNode = rootNode.getChildByPath(relativePath);
        const systemNode = getNodeBySystemPathIfAvailable(nodePath);
        // Keep the old absolute-path behavior for compatibility, including orphaned tracks whose
        // scene node has already been deleted. A live system node is rejected only when its unique
        // path suffix cannot represent the name-based path used by Cocos animation tracks.
        return systemNode && systemNode !== animationNode ? null : relativePath;
    }

    if (rootNode.getChildByPath(nodePath)) {
        return nodePath;
    }
    return null;
}

function getNodeBySystemPathIfAvailable(path: string): Node | null {
    if (typeof NodeMgr.getNodeByPath !== 'function') {
        return null;
    }
    try {
        return NodeMgr.getNodeByPath(path) || null;
    } catch {
        return null;
    }
}

function findRelativeNodePathByUuid(node: Node, uuid: string, prefix = ''): string | null {
    if (node.uuid === uuid) {
        return prefix;
    }
    for (const child of node.children) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        const result = findRelativeNodePathByUuid(child, uuid, path);
        if (result !== null) {
            return result;
        }
    }
    return null;
}

function normalizeNodePath(path: string): string {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
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
