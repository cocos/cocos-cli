'use strict';

import { isAbsolute, posix, win32 } from 'path';
import * as PathUtils from '../base/utils/path';

export interface AssetDBPathInfo {
    name: string;
    target: string;
}

function isAbsolutePath(value: string): boolean {
    return isAbsolute(value) || win32.isAbsolute(value) || posix.isAbsolute(value);
}

function normalizeForUrl(value: string): string {
    return PathUtils.normalize(value).replace(/\\/g, '/').replace(/\/+$/, '');
}

function normalizeForCompare(value: string): string {
    const normalized = normalizeForUrl(value);
    return process.platform === 'win32' || /^[a-zA-Z]:\//.test(normalized)
        ? normalized.toLowerCase()
        : normalized;
}

function containsPath(root: string, candidate: string): boolean {
    const normalizedRoot = normalizeForCompare(root);
    const normalizedCandidate = normalizeForCompare(candidate);

    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function relativeInsideRoot(root: string, candidate: string): string {
    const normalizedRoot = normalizeForUrl(root);
    const normalizedCandidate = normalizeForUrl(candidate);

    return normalizedCandidate === normalizedRoot ? '' : normalizedCandidate.slice(normalizedRoot.length + 1);
}

export function pathToDbUrlIfAssetDBPath(pathOrUrlOrUUID: string, assetDBInfo: Record<string, AssetDBPathInfo>) {
    if (!pathOrUrlOrUUID || pathOrUrlOrUUID.startsWith('db://')) {
        return pathOrUrlOrUUID;
    }

    if (!isAbsolutePath(pathOrUrlOrUUID)) {
        const normalizedRelativePath = pathOrUrlOrUUID
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '')
            .replace(/\/+$/, '');
        const [dbName, ...relativeParts] = normalizedRelativePath.split('/').filter(Boolean);
        const dbInfo = dbName && (
            assetDBInfo[dbName]
            ?? Object.values(assetDBInfo).find((info) => info.name === dbName)
            // Windows mounts are case-insensitive, so a differently-cased db name still addresses the same mount.
            ?? (process.platform === 'win32'
                ? Object.values(assetDBInfo).find((info) => info.name.toLowerCase() === dbName.toLowerCase())
                : undefined)
        );

        if (dbInfo) {
            return relativeParts.length ? `db://${dbInfo.name}/${relativeParts.join('/')}` : `db://${dbInfo.name}`;
        }

        return pathOrUrlOrUUID;
    }

    const matchedDBInfo = Object.values(assetDBInfo)
        .filter((info) => info?.target && containsPath(info.target, pathOrUrlOrUUID))
        .sort((a, b) => normalizeForCompare(b.target).length - normalizeForCompare(a.target).length)[0];

    if (!matchedDBInfo) {
        return pathOrUrlOrUUID;
    }

    const relativePath = relativeInsideRoot(matchedDBInfo.target, pathOrUrlOrUUID);

    return relativePath ? `db://${matchedDBInfo.name}/${relativePath}` : `db://${matchedDBInfo.name}`;
}
