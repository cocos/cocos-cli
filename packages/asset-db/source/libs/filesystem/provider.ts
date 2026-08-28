'use strict';

export interface IAssetFileStat {
    mtimeMs: number;
    isDirectory(): boolean;
}

export type IAssetOperationOrigin = 'direct-op' | 'watcher';

export type IAssetOperationKind = 'write' | 'rename' | 'move' | 'copy' | 'delete';

export interface IAssetOperationContext {
    opId: string;
    kind: IAssetOperationKind;
    origin: IAssetOperationOrigin;
    source: string;
    paths: string[];
    timestamp: number;
}

interface IAssetOperationOptionsBase {
    context?: IAssetOperationContext;
}

export interface IAssetDeleteOptions extends IAssetOperationOptionsBase {
    recursive?: boolean;
    useTrash?: boolean;
}

export interface IAssetRenameOptions extends IAssetOperationOptionsBase {
    overwrite?: boolean;
}

export interface IAssetWriteFileOptions extends IAssetOperationOptionsBase {
    create?: boolean;
    overwrite?: boolean;
}

export interface IAssetFileSystemProvider {
    readFile?(path: string, encoding?: BufferEncoding): Promise<Buffer | string> | Buffer | string;
    writeFile?(path: string, content: Buffer | string | Uint8Array, options?: IAssetWriteFileOptions): Promise<void> | void;
    createDirectory?(path: string): Promise<void> | void;
    delete?(path: string, options?: IAssetDeleteOptions): Promise<void> | void;
    rename?(oldPath: string, newPath: string, options?: IAssetRenameOptions): Promise<void> | void;
    copy?(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions): Promise<void> | void;
}
