'use strict';

import type { IAssetFileSystemProvider, IAssetRenameOptions, IAssetWriteFileOptions } from '@cocos/asset-db';
import { copy as fsCopy, ensureDir, existsSync, move, outputFile, readFile as fsReadFile, remove } from 'fs-extra';
import { dirname, join, relative } from 'path';
import type { IMoveOptions } from '../@types/private';
import type { DeleteAssetOptions } from '../@types/public';
import assetConfig from '../asset-config';
import Utils from '../../base/utils';

const localFileSystemProvider: IAssetFileSystemProvider = {
    async readFile(path: string, encoding?: BufferEncoding): Promise<Buffer | string> {
        if (encoding) {
            return await fsReadFile(path, encoding);
        }

        return await fsReadFile(path);
    },
    async writeFile(path: string, content: Buffer | string | Uint8Array, _options?: IAssetWriteFileOptions): Promise<void> {
        await ensureDir(dirname(path));
        await outputFile(path, content as any);
    },
    async createDirectory(path: string): Promise<void> {
        await ensureDir(path);
    },
    async delete(path: string, options: DeleteAssetOptions = {}): Promise<void> {
        if (options.useTrash !== false) {
            await Utils.File.trashItem(path);
            return;
        }

        await remove(path);
    },
    async rename(oldPath: string, newPath: string, options?: IAssetRenameOptions): Promise<void> {
        await move(oldPath, newPath, { overwrite: !!options?.overwrite });
    },
    async copy(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions): Promise<void> {
        if (options?.overwrite === undefined) {
            await fsCopy(sourcePath, destinationPath);
            return;
        }

        await fsCopy(sourcePath, destinationPath, { overwrite: options.overwrite });
    },
};

let provider: IAssetFileSystemProvider = localFileSystemProvider;

function assignProviderMethod<K extends keyof IAssetFileSystemProvider>(
    targetProvider: IAssetFileSystemProvider,
    key: K,
    method: IAssetFileSystemProvider[K],
): void {
    targetProvider[key] = method;
}

function mergeFileSystemProvider(nextProvider?: IAssetFileSystemProvider): IAssetFileSystemProvider {
    const mergedProvider: IAssetFileSystemProvider = {
        ...localFileSystemProvider,
    };

    if (!nextProvider) {
        return mergedProvider;
    }

    for (const key of Object.keys(nextProvider) as Array<keyof IAssetFileSystemProvider>) {
        const method = nextProvider[key];
        if (method) {
            assignProviderMethod(mergedProvider, key, method);
        }
    }

    return mergedProvider;
}

export function getFileSystemProvider(): IAssetFileSystemProvider {
    return provider;
}

export function setFileSystemProvider(nextProvider: IAssetFileSystemProvider): void {
    provider = mergeFileSystemProvider(nextProvider);
}

export function resetFileSystemProvider(): void {
    provider = mergeFileSystemProvider();
}

export async function readPath(path: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    return await Promise.resolve(provider.readFile!(path, encoding));
}

export async function writePath(path: string, content: Buffer | string | Uint8Array, options?: IAssetWriteFileOptions): Promise<void> {
    await Promise.resolve(provider.writeFile!(path, content, options));
}

export async function createDirectoryPath(path: string): Promise<void> {
    await Promise.resolve(provider.createDirectory!(path));
}

export async function deletePath(path: string, options: DeleteAssetOptions = {}): Promise<void> {
    await Promise.resolve(provider.delete!(path, options));
}

export async function renamePath(oldPath: string, newPath: string, options?: IAssetRenameOptions): Promise<void> {
    await Promise.resolve(provider.rename!(oldPath, newPath, options));
}

export async function copyPath(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions): Promise<void> {
    await Promise.resolve(provider.copy!(sourcePath, destinationPath, options));
}

export async function removeAssetSource(file: string, options: DeleteAssetOptions = {}): Promise<boolean> {
    if (!existsSync(file)) {
        return true;
    }

    const deleteOptions: DeleteAssetOptions = {
        useTrash: options.useTrash !== false,
    };

    try {
        await deletePath(file, deleteOptions);
    } catch (error) {
        console.error(error);
        throw new Error(`asset db removeFile ${file} fail!`);
    }

    try {
        const metaFile = file + '.meta';
        if (existsSync(metaFile)) {
            await deletePath(metaFile, deleteOptions);
        }
    } catch (error) {
        // do nothing
    }

    return true;
}

export async function moveAssetSource(source: string, target: string, options?: IMoveOptions): Promise<void> {
    const moveOptions = options?.overwrite ? options : { overwrite: false };
    const renameOptions = { overwrite: !!moveOptions.overwrite };

    try {
        if (!Utils.Path.contains(source, target)) {
            await renamePath(source + '.meta', target + '.meta', { overwrite: true });
            await renamePath(source, target, renameOptions);
            return;
        }

        const tempDir = join(assetConfig.data.tempRoot, 'move-temp');
        const relativePath = relative(assetConfig.data.root, target);
        const tempPath = join(tempDir, relativePath);
        const tempMetaPath = tempPath + '.meta';

        if (existsSync(tempPath)) {
            await deletePath(tempPath, { useTrash: false });
        }
        if (existsSync(tempMetaPath)) {
            await deletePath(tempMetaPath, { useTrash: false });
        }

        await renamePath(source + '.meta', tempMetaPath, { overwrite: true });
        await renamePath(source, tempPath, { overwrite: true });

        await renamePath(tempMetaPath, target + '.meta', { overwrite: true });
        await renamePath(tempPath, target, renameOptions);
    } catch (error) {
        console.error(`asset db moveFile from ${source} -> ${target} fail!`);
        console.error(error);
    }
}
