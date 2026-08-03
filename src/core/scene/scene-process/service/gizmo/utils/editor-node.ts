import cc, { type Node } from 'cc';

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
    return getEditorNodeApi()?.getNodeByPath?.(path) ?? getPrefabNodeByRelativePath(path);
}

export function getEditorNodeByUuid(uuid: string): Node | null {
    if (!uuid) {
        return null;
    }
    return getEditorNodeApi()?.getNode?.(uuid) ?? null;
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
