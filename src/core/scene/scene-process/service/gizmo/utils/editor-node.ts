import cc, { type Node } from 'cc';
import { formatUniqueName, normalizeNodePath, sanitizeNodeName } from '../../../../../engine/editor-extends/manager/path-utils';

function getEditorNodeApi(): any {
    const ccGlobal = (globalThis as any).cc;
    return (cc as any)?.EditorExtends?.Node
        || ccGlobal?.EditorExtends?.Node
        || (globalThis as any).EditorExtends?.Node;
}

// After name/path decoupling, fall back to prefab-relative path lookup when system path lookup fails
export function getEditorNodeByPath(path: string): Node | null {
    if (!path) {
        return null;
    }
    const editorType = getCurrentEditorType();
    if (editorType !== 'prefab') {
        const nodeInEditor = findSceneNodeByPath(getCurrentEditorRoot(), path);
        if (nodeInEditor) {
            return nodeInEditor;
        }
    }

    const node = getEditorNodeApi()?.getNodeByPath?.(path) ?? null;
    if (node && !isEditorOnlyNode(node)) {
        return node;
    }
    return getPrefabNodeByRelativePath(path);
}

export function getEditorNodeByUuid(uuid: string): Node | null {
    if (!uuid) {
        return null;
    }

    // Runtime-created editor helpers (grid, gizmos, temporary cameras, etc.)
    // use generated `Node.xxx` UUIDs. A deserialized scene node can carry the
    // same UUID, while EditorExtends.Node.getNode() only returns one entry from
    // the global lookup table. Prefer the node that belongs to the currently
    // edited scene so selection/gizmo lookup cannot be redirected to an editor
    // helper with a colliding UUID.
    const editorRoot = getCurrentEditorRoot();
    const nodeInEditor = findNodeByUuid(editorRoot, uuid);
    return nodeInEditor ?? getEditorNodeApi()?.getNode?.(uuid) ?? null;
}

export function getEditorNodeUuidByPath(path: string): string {
    if (!path) {
        return '';
    }
    const nodeApi = getEditorNodeApi();
    return nodeApi?.getNodeUuidByPath?.(path) || getPrefabNodeByRelativePath(path)?.uuid || '';
}

export function getEditorNodePath(node: Node): string {
    return getEditorNodeApi()?.getNodePath?.(node) ?? '';
}

function getPrefabNodeByRelativePath(path: string): Node | null {
    try {
        const { Service } = require('../../core/decorator');
        if (Service.Editor?.getCurrentEditorType?.() !== 'prefab') {
            return null;
        }
        const root = Service.Editor?.getRootNode?.() as Node | null;
        if (!root) {
            return null;
        }
        return findNodeFromPrefabRoot(root, path);
    } catch {
        return null;
    }
}

function getCurrentEditorRoot(): Node | null {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Editor?.getRootNode?.() as Node | null;
    } catch {
        return null;
    }
}

function getCurrentEditorType(): 'scene' | 'prefab' | 'unknown' {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Editor?.getCurrentEditorType?.() ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function findNodeByUuid(root: Node | null, uuid: string): Node | null {
    if (!root) {
        return null;
    }
    if (root.uuid === uuid && !isEditorOnlyNode(root)) {
        return root;
    }
    for (const child of root.children ?? []) {
        const result = findNodeByUuid(child, uuid);
        if (result) {
            return result;
        }
    }
    return null;
}

/**
 * Resolve a scene path from the actual hierarchy. NodeManager indexes by UUID,
 * so a generated editor helper with a colliding UUID can otherwise make a
 * perfectly valid path resolve to that helper. This mirrors NodePathManager's
 * sibling suffix allocation while excluding editor-only branches.
 */
function findSceneNodeByPath(root: Node | null, path: string): Node | null {
    if (!root) {
        return null;
    }
    const normalized = normalizeNodePath(path.replace(/\\/g, '/'));
    if (normalized === '/') {
        return root;
    }
    const segments = normalized.split('/').filter(Boolean);
    let current = root;
    for (const segment of segments) {
        const usedNames = new Set<string>();
        const exactMatches: Node[] = [];
        const insensitiveMatches: Node[] = [];
        for (const child of current.children ?? []) {
            if (isEditorOnlyNode(child)) {
                continue;
            }
            const baseName = sanitizeNodeName(child.name);
            let uniqueName = baseName;
            let suffix = 1;
            while (usedNames.has(uniqueName)) {
                uniqueName = formatUniqueName(baseName, suffix++);
            }
            usedNames.add(uniqueName);
            if (uniqueName === segment) {
                exactMatches.push(child);
            } else if (uniqueName.toLowerCase() === segment.toLowerCase()) {
                insensitiveMatches.push(child);
            }
        }
        const next = exactMatches[0] ?? (insensitiveMatches.length === 1 ? insensitiveMatches[0] : null);
        if (!next) {
            return null;
        }
        current = next;
    }
    return current;
}

function isEditorOnlyNode(node: Node): boolean {
    const layers = (cc as any)?.Layers?.Enum ?? (globalThis as any)?.cc?.Layers?.Enum;
    const editorMask = (layers?.GIZMOS ?? 0) | (layers?.SCENE_GIZMO ?? 0) | (layers?.EDITOR ?? 0);
    let current: Node | null = node;
    while (current) {
        if (editorMask && (current.layer & editorMask) !== 0) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/**
 * Find child node within a prefab by traversing path segments level by level.
 * After name/path decoupling, prefers matching by system path last segment (uniquely determined);
 * falls back to child.name matching when the API is unavailable (backward compatible).
 */
function findNodeFromPrefabRoot(root: Node, path: string): Node | null {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const api = getEditorNodeApi();
    const rootPath: string = api?.getNodePath?.(root) ?? '';
    const rootPathSegment = rootPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
    const segments = normalizePrefabPathSegments(
        normalized.split('/').filter(Boolean),
        root.name,
        rootPathSegment,
        getCurrentSceneName(),
    );
    if (!segments) {
        return null;
    }
    let node: Node | null = root;
    for (const segment of segments) {
        if (!node) {
            return null;
        }
        const children: readonly Node[] = node.children ?? [];
        let hasSystemPath = false;
        let systemPathMatch: Node | null = null;
        for (const child of children) {
            const childPath: string = api?.getNodePath?.(child) ?? '';
            const childPathSegment = childPath.replace(/\\/g, '/').split('/').filter(Boolean).pop();
            if (!childPathSegment) {
                continue;
            }
            hasSystemPath = true;
            if (childPathSegment === segment) {
                systemPathMatch = child;
                break;
            }
        }
        if (hasSystemPath) {
            node = systemPathMatch;
            continue;
        }
        node = children.find((child: Node) => child.name === segment) ?? null;
    }
    return node;
}

function getCurrentSceneName(): string {
    return (cc as any).director?.getScene?.()?.name ?? '';
}

// Match root segment by both system path last segment and display name, preventing mismatch when name != path segment after rename
function normalizePrefabPathSegments(
    segments: string[],
    rootName: string,
    rootPathSegment: string,
    currentSceneName: string,
): string[] | null {
    const matchesRoot = (segment: string | undefined): boolean => {
        const authoritativeRootSegment = rootPathSegment || rootName;
        return Boolean(authoritativeRootSegment && segment === authoritativeRootSegment);
    };
    if (matchesRoot(segments[0])) {
        return segments.slice(1);
    }
    if (segments[0] === 'should_hide_in_hierarchy') {
        if (matchesRoot(segments[1])) {
            return segments.slice(2);
        }
    }
    if (segments[0] === currentSceneName && segments[1] === 'should_hide_in_hierarchy') {
        if (matchesRoot(segments[2])) {
            return segments.slice(3);
        }
    }
    return null;
}
