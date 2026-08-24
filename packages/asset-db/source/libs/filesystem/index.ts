'use strict';

import { normalize } from 'path';
import { LocalAssetFileSystemProvider } from './local-provider';
import {
    IAssetDeleteOptions,
    IAssetFileStat,
    IAssetFileSystemProvider,
    IAssetOperationContext,
    IAssetOperationKind,
    IAssetOperationOrigin,
    IAssetRenameOptions,
    IAssetWriteFileOptions,
} from './provider';

const localProvider = new LocalAssetFileSystemProvider();
let provider: IAssetFileSystemProvider = localProvider;
const operationContexts = new Map<string, IAssetOperationContext>();
const OPERATION_CONTEXT_TTL = 30 * 1000;

function normalizeOperationPath(path: string) {
    return normalize(path);
}

function pruneOperationContexts(now = Date.now()) {
    for (const [path, context] of operationContexts) {
        if (now - context.timestamp > OPERATION_CONTEXT_TTL) {
            operationContexts.delete(path);
        }
    }
}

function rememberOperationContext(context?: IAssetOperationContext) {
    if (!context) {
        return;
    }
    pruneOperationContexts(context.timestamp);
    for (const path of context.paths) {
        operationContexts.set(normalizeOperationPath(path), context);
    }
}

function createWatcherOperationContext(path: string, kind: IAssetOperationKind, source = path): IAssetOperationContext {
    const timestamp = Date.now();
    return {
        opId: `asset-watcher-${timestamp}-${Math.random().toString(16).slice(2)}`,
        kind,
        origin: 'watcher',
        source,
        paths: [path],
        timestamp,
    };
}

export function getFileSystemProvider() {
    return provider;
}

export function setFileSystemProvider(nextProvider: IAssetFileSystemProvider) {
    provider = nextProvider;
}

export function resetFileSystemProvider() {
    provider = localProvider;
}

export function resetOperationContexts() {
    operationContexts.clear();
}

export function peekOperationContext(path: string) {
    pruneOperationContexts();
    return operationContexts.get(normalizeOperationPath(path));
}

export function takeOperationContext(path: string) {
    pruneOperationContexts();
    const key = normalizeOperationPath(path);
    const context = operationContexts.get(key);
    operationContexts.delete(key);
    return context;
}

export function resolveOperationContext(path: string, kind: IAssetOperationKind, source = path) {
    return takeOperationContext(path) || createWatcherOperationContext(path, kind, source);
}

function resolveProviderMethod<K extends keyof IAssetFileSystemProvider>(name: K): NonNullable<IAssetFileSystemProvider[K]> {
    const method = provider[name] || localProvider[name];
    if (!method) {
        throw new Error(`asset filesystem provider method "${String(name)}" is not implemented`);
    }
    return method as NonNullable<IAssetFileSystemProvider[K]>;
}

function getMethodOwner<K extends keyof IAssetFileSystemProvider>(name: K) {
    return provider[name] ? provider : localProvider;
}

export async function fsExists(path: string) {
    return await Promise.resolve(localProvider.exists(path));
}

export async function fsStat(path: string): Promise<IAssetFileStat> {
    return await Promise.resolve(localProvider.stat(path));
}

export async function fsReadFile(path: string, encoding?: BufferEncoding) {
    const readFile = resolveProviderMethod('readFile');
    return await Promise.resolve(readFile.call(getMethodOwner('readFile'), path, encoding));
}

export async function fsWriteFile(path: string, content: Buffer | string | Uint8Array, options?: IAssetWriteFileOptions) {
    rememberOperationContext(options?.context);
    const writeFile = resolveProviderMethod('writeFile');
    await Promise.resolve(writeFile.call(getMethodOwner('writeFile'), path, content, options));
}

export async function fsCreateDirectory(path: string) {
    const createDirectory = resolveProviderMethod('createDirectory');
    await Promise.resolve(createDirectory.call(getMethodOwner('createDirectory'), path));
}

export async function fsDelete(path: string, options?: IAssetDeleteOptions) {
    rememberOperationContext(options?.context);
    const deleteFile = resolveProviderMethod('delete');
    await Promise.resolve(deleteFile.call(getMethodOwner('delete'), path, options));
}

export async function fsRename(oldPath: string, newPath: string, options?: IAssetRenameOptions) {
    rememberOperationContext(options?.context);
    const rename = resolveProviderMethod('rename');
    await Promise.resolve(rename.call(getMethodOwner('rename'), oldPath, newPath, options));
}

export async function fsCopy(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions) {
    rememberOperationContext(options?.context);
    const copy = resolveProviderMethod('copy');
    await Promise.resolve(copy.call(getMethodOwner('copy'), sourcePath, destinationPath, options));
}

export type {
    IAssetDeleteOptions,
    IAssetFileStat,
    IAssetFileSystemProvider,
    IAssetOperationContext,
    IAssetOperationKind,
    IAssetOperationOrigin,
    IAssetRenameOptions,
    IAssetWriteFileOptions,
};
