'use strict';

import { dirname } from 'path';
import { access, copy, ensureDir, move, outputFile, readFile, remove, stat } from 'fs-extra';
import { IAssetDeleteOptions, IAssetFileSystemProvider, IAssetRenameOptions, IAssetWriteFileOptions } from './provider';

export class LocalAssetFileSystemProvider implements IAssetFileSystemProvider {
    async exists(path: string) {
        try {
            await access(path);
            return true;
        } catch {
            return false;
        }
    }

    async stat(path: string) {
        return await stat(path);
    }

    async readFile(path: string, encoding?: BufferEncoding) {
        if (encoding) {
            return await readFile(path, encoding);
        }
        return await readFile(path);
    }

    async writeFile(path: string, content: Buffer | string | Uint8Array, _options?: IAssetWriteFileOptions) {
        await ensureDir(dirname(path));
        await outputFile(path, content as any);
    }

    async createDirectory(path: string) {
        await ensureDir(path);
    }

    async delete(path: string, _options?: IAssetDeleteOptions) {
        await remove(path);
    }

    async rename(oldPath: string, newPath: string, options?: IAssetRenameOptions) {
        await move(oldPath, newPath, { overwrite: !!options?.overwrite });
    }

    async copy(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions) {
        if (options?.overwrite === undefined) {
            await copy(sourcePath, destinationPath);
            return;
        }

        await copy(sourcePath, destinationPath, { overwrite: options.overwrite });
    }
}
