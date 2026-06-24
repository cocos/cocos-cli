import type { AnimationMaskChange, AnimationMaskDump, AnimationMaskJoint } from './@types/public';

export const ANIMATION_MASK_TYPE = 'cc.animation.AnimationMask';
export const JOINT_MASK_TYPE = 'cc.JointMask';
export const PREFAB_TYPE = 'cc.Prefab';
export const NODE_TYPE = 'cc.Node';

export interface SerializedJointMask {
    __type__?: string;
    path: string;
    enabled: boolean;
}

export type SerializedNodeRef = { __id__: number };

export interface SerializedNode {
    __type__?: string;
    _name?: string;
    _children?: SerializedNodeRef[];
}

export function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(message);
    }
}

export function normalizeJointPath(path: string): string {
    return path.split('/').map((segment) => segment.trim()).filter(Boolean).join('/');
}

export function normalizeJointMasks(value: unknown): SerializedJointMask[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error('AnimationMask _jointMasks must be an array');
    }

    const result: SerializedJointMask[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        assertRecord(item, 'AnimationMask joint mask item must be an object');
        const path = normalizeJointPath(String(item.path ?? ''));
        if (!path) {
            continue;
        }
        if (seen.has(path)) {
            throw new Error(`Duplicate AnimationMask joint path: ${path}`);
        }
        seen.add(path);
        result.push({
            __type__: typeof item.__type__ === 'string' ? item.__type__ : JOINT_MASK_TYPE,
            path,
            enabled: item.enabled !== false,
        });
    }
    return result;
}

export function jointMasksToDump(assetUuid: string, jointMasks: SerializedJointMask[]): AnimationMaskDump {
    const nodeMap = new Map<string, AnimationMaskJoint>();
    for (const mask of jointMasks) {
        nodeMap.set(mask.path, {
            path: mask.path,
            enabled: mask.enabled,
        });
    }

    const roots: AnimationMaskJoint[] = [];
    const sorted = Array.from(nodeMap.values()).sort((a, b) => a.path.localeCompare(b.path));
    for (const node of sorted) {
        const parentPath = findNearestExplicitParentPath(node.path, nodeMap);
        if (!parentPath) {
            roots.push(node);
            continue;
        }
        const parent = nodeMap.get(parentPath)!;
        parent.children = parent.children || [];
        parent.children.push(node);
    }

    return {
        version: 1,
        assetUuid,
        joints: roots,
    };
}

function findNearestExplicitParentPath(path: string, nodeMap: Map<string, AnimationMaskJoint>): string | null {
    let index = path.lastIndexOf('/');
    while (index > 0) {
        const parentPath = path.slice(0, index);
        if (nodeMap.has(parentPath)) {
            return parentPath;
        }
        index = parentPath.lastIndexOf('/');
    }
    return null;
}

function isNodeRef(value: unknown): value is SerializedNodeRef {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && typeof (value as SerializedNodeRef).__id__ === 'number';
}

export function extractPrefabJointPaths(prefabJSON: unknown[]): string[] {
    const root = prefabJSON[1];
    assertRecord(root, 'Prefab JSON must contain root node at index 1');
    if (root.__type__ !== NODE_TYPE) {
        throw new Error('Prefab JSON root entry must be cc.Node');
    }

    const paths: string[] = [];
    const seen = new Set<string>();
    visitChildren(root as SerializedNode, '');
    return paths;

    function visitChildren(node: SerializedNode, parentPath: string): void {
        const children = Array.isArray(node._children) ? node._children : [];
        for (const childRef of children) {
            if (!isNodeRef(childRef)) {
                continue;
            }
            const child = prefabJSON[childRef.__id__] as SerializedNode | undefined;
            if (!child || child.__type__ !== NODE_TYPE) {
                continue;
            }
            const name = String(child._name ?? '').trim();
            if (!name) {
                continue;
            }
            const path = parentPath ? `${parentPath}/${name}` : name;
            if (seen.has(path)) {
                throw new Error(`Duplicate skeleton joint path: ${path}`);
            }
            seen.add(path);
            paths.push(path);
            visitChildren(child, path);
        }
    }
}

export function applyJointChanges(jointMasks: SerializedJointMask[], changes: AnimationMaskChange[]): SerializedJointMask[] {
    const result = jointMasks.map((joint) => ({ ...joint }));
    const pathToJoint = new Map(result.map((joint) => [joint.path, joint]));

    for (const change of changes) {
        const path = normalizeJointPath(change.path);
        if (!path) {
            throw new Error('AnimationMask change path must not be empty');
        }
        const target = pathToJoint.get(path);
        if (!target) {
            throw new Error(`AnimationMask joint path not found: ${path}`);
        }
        const shouldUpdate = (joint: SerializedJointMask) => joint.path === path || (!!change.recursive && joint.path.startsWith(`${path}/`));
        for (const joint of result) {
            if (shouldUpdate(joint)) {
                joint.enabled = change.enabled;
            }
        }
    }

    return result;
}
