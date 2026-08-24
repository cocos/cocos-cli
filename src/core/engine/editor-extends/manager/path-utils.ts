/**
 * Generate a unique name: returns the original if no conflict, appends _001, _002, ... suffix if duplicate.
 * @param baseName - base name
 * @param existingCount - number of existing same-name entries (0 means no conflict)
 */
export function formatUniqueName(baseName: string, existingCount: number): string {
    if (existingCount <= 0) {
        return baseName;
    }
    return `${baseName}_${String(existingCount).padStart(3, '0')}`;
}

/**
 * Characters not allowed in node names. These have special meaning in file system paths
 * or node path separators and cause path resolution ambiguity
 * (e.g. '/' conflicts with path separator, ':' is illegal in Windows paths).
 */
export const ILLEGAL_NAME_CHARS = /[/\\:*?"<>|]/;

/**
 * Validate whether a node name is legal.
 * @returns error description if invalid, null if valid
 */
export function validateNodeName(name: string): string | null {
    const match = name.match(ILLEGAL_NAME_CHARS);
    if (match) {
        return `Node name "${name}" contains illegal character '${match[0]}'. Characters /\\:*?"<>| are not allowed.`;
    }
    return null;
}

/**
 * Replace illegal characters in a name with '_'.
 * Only for internal NodePathManager fallback; external entry points should reject via validateNodeName.
 */
export function sanitizeNodeName(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * Remove leading '/' from a path. Indexed paths never start with '/',
 * but callers may spell them either way ('/Canvas' and 'Canvas' are the same node).
 */
export function stripLeadingSlashes(path: string): string {
    return path.replace(/^\/+/, '');
}

/**
 * Normalize a node path for lookup: strips leading '/', and keeps a path made of
 * slashes only as '/', which denotes the root instead of an empty path.
 */
export function normalizeNodePath(path: string): string {
    if (!path) {
        return path;
    }
    const stripped = stripLeadingSlashes(path);
    return stripped === '' ? '/' : stripped;
}

/**
 * Whether a path denotes the root ('/', '//', ...). An empty path is not a root path.
 */
export function isRootNodePath(path: string | undefined): boolean {
    return !!path && stripLeadingSlashes(path) === '';
}
