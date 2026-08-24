'use strict';

import { readdirSync } from 'fs';
import { isAbsolute, join, normalize, parse, relative, sep } from 'path';

const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g;
const pathRecordIndexes = new WeakMap<object, Map<string, string>>();

function toLowerCase(value: string): string {
    return value.toLowerCase();
}

function toWindowsPathSegmentKey(value: string): string {
    return value.replace(fileNameLowerCaseRegExp, toLowerCase);
}

function normalizeAbsolutePath(value: string): string {
    let normalized = normalize(value);
    const root = parse(normalized).root;
    while (normalized.length > root.length && normalized.endsWith(sep)) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * Generate a stable identity key for an absolute filesystem path.
 * Non-path values such as UUIDs and db:// URLs are returned unchanged.
 */
export function toPathKey(value: string): string {
    if (!isAbsolute(value)) {
        return value;
    }

    const normalized = normalizeAbsolutePath(value);
    if (process.platform !== 'win32') {
        return normalized;
    }

    // Keep the same Unicode exceptions used by Creator/TypeScript filename keys.
    return toWindowsPathSegmentKey(normalized);
}

/**
 * Resolve the casing currently stored on disk for a path inside a known root.
 * The configured root casing is preserved because Windows drive letters do not
 * have a filesystem-provided canonical representation.
 */
export function resolveRealPathCase(value: string, root: string): string {
    const normalized = normalizeAbsolutePath(value);
    const normalizedRoot = normalizeAbsolutePath(root);
    if (
        process.platform !== 'win32' ||
        !isAbsolute(normalized) ||
        !isAbsolute(normalizedRoot)
    ) {
        return normalized;
    }

    if (toPathKey(normalized) === toPathKey(normalizedRoot)) {
        return normalizedRoot;
    }

    const relativePath = relative(normalizedRoot, normalized);
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        return normalized;
    }

    const segments = relativePath.split(sep).filter(Boolean);
    let resolved = normalizedRoot;
    for (let index = 0; index < segments.length; index++) {
        let entries: string[];
        try {
            entries = readdirSync(resolved);
        } catch {
            return join(resolved, ...segments.slice(index));
        }

        const segmentKey = toWindowsPathSegmentKey(segments[index]);
        const matches = entries.filter((entry) => toWindowsPathSegmentKey(entry) === segmentKey);
        if (matches.length > 1) {
            throw new PathCaseConflictError(
                join(resolved, matches[0]),
                join(resolved, matches[1]),
            );
        }
        if (matches.length === 0) {
            return join(resolved, ...segments.slice(index));
        }
        resolved = join(resolved, matches[0]);
    }
    return resolved;
}

export function isSamePath(left: string, right: string): boolean {
    if (!isAbsolute(left) || !isAbsolute(right)) {
        return left === right;
    }
    return toPathKey(left) === toPathKey(right);
}

export function isSubPath(candidate: string, root: string): boolean {
    if (!isAbsolute(candidate) || !isAbsolute(root)) {
        return false;
    }

    const candidateKey = toPathKey(candidate);
    const rootKey = toPathKey(root);
    if (candidateKey === rootKey) {
        return false;
    }

    const rootWithSeparator = rootKey.endsWith(sep) ? rootKey : rootKey + sep;
    return candidateKey.startsWith(rootWithSeparator);
}

export class PathCaseConflictError extends Error {
    readonly code = 'ASSET_DB_PATH_CASE_CONFLICT';
    readonly paths: readonly [string, string];

    constructor(existingPath: string, incomingPath: string) {
        super(
            `Windows path case conflict: "${existingPath}" and "${incomingPath}" ` +
            'resolve to the same case-insensitive identity. AssetDB cannot index both paths.'
        );
        this.name = 'PathCaseConflictError';
        this.paths = [existingPath, incomingPath];
    }
}

export class PathMap<Value> extends Map<string, Value> {
    private readonly keyIndex = new Map<string, string>();

    constructor(entries?: readonly (readonly [string, Value])[] | null) {
        super();
        if (entries) {
            entries.forEach(([key, value]) => this.set(key, value));
        }
    }

    getStoredKey(key: string): string | undefined {
        return this.keyIndex.get(toPathKey(key));
    }

    override has(key: string): boolean {
        return this.keyIndex.has(toPathKey(key));
    }

    override get(key: string): Value | undefined {
        const storedKey = this.getStoredKey(key);
        return storedKey === undefined ? undefined : super.get(storedKey);
    }

    override set(key: string, value: Value): this {
        const identityKey = toPathKey(key);
        const storedKey = this.keyIndex.get(identityKey);
        if (storedKey !== undefined && storedKey !== key) {
            super.delete(storedKey);
        }
        this.keyIndex.set(identityKey, key);
        super.set(key, value);
        return this;
    }

    override delete(key: string): boolean {
        const identityKey = toPathKey(key);
        const storedKey = this.keyIndex.get(identityKey);
        if (storedKey === undefined) {
            return false;
        }
        this.keyIndex.delete(identityKey);
        return super.delete(storedKey);
    }

    override clear(): void {
        this.keyIndex.clear();
        super.clear();
    }
}

export class PathSet extends Set<string> {
    private readonly valueIndex = new Map<string, string>();

    constructor(values?: readonly string[] | null) {
        super();
        values?.forEach((value) => this.add(value));
    }

    getStoredValue(value: string): string | undefined {
        return this.valueIndex.get(toPathKey(value));
    }

    override has(value: string): boolean {
        return this.valueIndex.has(toPathKey(value));
    }

    override add(value: string): this {
        const identityKey = toPathKey(value);
        const storedValue = this.valueIndex.get(identityKey);
        if (storedValue !== undefined && storedValue !== value) {
            super.delete(storedValue);
        }
        this.valueIndex.set(identityKey, value);
        super.add(value);
        return this;
    }

    override delete(value: string): boolean {
        const identityKey = toPathKey(value);
        const storedValue = this.valueIndex.get(identityKey);
        if (storedValue === undefined) {
            return false;
        }
        this.valueIndex.delete(identityKey);
        return super.delete(storedValue);
    }

    override clear(): void {
        this.valueIndex.clear();
        super.clear();
    }
}

export type PathRecord<Value> = { [path: string]: Value };

/**
 * Create an object-compatible path dictionary. Bracket access and Object.keys()
 * remain available while absolute Windows path lookups become case-insensitive.
 */
export function createPathRecord<Value>(): PathRecord<Value> {
    const target: PathRecord<Value> = {};
    const keyIndex = new Map<string, string>();

    const proxy = new Proxy(target, {
        get(current, property) {
            if (typeof property !== 'string') {
                return Reflect.get(current, property);
            }
            const storedKey = keyIndex.get(toPathKey(property));
            return Reflect.get(current, storedKey === undefined ? property : storedKey);
        },
        set(current, property, value) {
            if (typeof property !== 'string') {
                return Reflect.set(current, property, value);
            }
            const identityKey = toPathKey(property);
            const storedKey = keyIndex.get(identityKey);
            if (storedKey !== undefined && storedKey !== property) {
                Reflect.deleteProperty(current, storedKey);
            }
            keyIndex.set(identityKey, property);
            return Reflect.set(current, property, value);
        },
        deleteProperty(current, property) {
            if (typeof property !== 'string') {
                return Reflect.deleteProperty(current, property);
            }
            const identityKey = toPathKey(property);
            const storedKey = keyIndex.get(identityKey);
            if (storedKey === undefined) {
                return true;
            }
            keyIndex.delete(identityKey);
            return Reflect.deleteProperty(current, storedKey);
        },
        has(current, property) {
            if (typeof property !== 'string') {
                return Reflect.has(current, property);
            }
            const storedKey = keyIndex.get(toPathKey(property));
            return storedKey === undefined ? Reflect.has(current, property) : true;
        },
        getOwnPropertyDescriptor(current, property) {
            if (typeof property !== 'string') {
                return Reflect.getOwnPropertyDescriptor(current, property);
            }
            const storedKey = keyIndex.get(toPathKey(property));
            return Reflect.getOwnPropertyDescriptor(current, storedKey === undefined ? property : storedKey);
        },
    });

    pathRecordIndexes.set(proxy, keyIndex);
    return proxy;
}

export function getPathRecordStoredKey<Value>(record: PathRecord<Value>, key: string): string | undefined {
    const index = pathRecordIndexes.get(record);
    if (index) {
        return index.get(toPathKey(key));
    }
    return Object.prototype.hasOwnProperty.call(record, key) ? key : undefined;
}

export function replacePathRecordKey<Value>(record: PathRecord<Value>, oldKey: string, newKey: string): boolean {
    const storedKey = getPathRecordStoredKey(record, oldKey);
    if (storedKey === undefined) {
        return false;
    }
    const value = record[storedKey];
    if (storedKey !== newKey) {
        delete record[storedKey];
    }
    record[newKey] = value;
    return true;
}

export function getMapStoredPathKey<Value>(map: Map<string, Value>, key: string): string | undefined {
    return map instanceof PathMap ? map.getStoredKey(key) : (map.has(key) ? key : undefined);
}

export function getSetStoredPathValue(set: Set<string>, value: string): string | undefined {
    return set instanceof PathSet ? set.getStoredValue(value) : (set.has(value) ? value : undefined);
}

export function findPathAwareIndex(values: readonly string[], value: string): number {
    return values.findIndex((candidate) => isSamePath(candidate, value));
}

export function assertNoPathIdentityConflicts(paths: readonly string[]): void {
    if (process.platform !== 'win32') {
        return;
    }

    const seen = new PathMap<true>();
    for (const path of paths) {
        const storedPath = seen.getStoredKey(path);
        if (storedPath !== undefined && storedPath !== path && normalize(storedPath) !== normalize(path)) {
            throw new PathCaseConflictError(storedPath, path);
        }
        seen.set(path, true);
    }
}
