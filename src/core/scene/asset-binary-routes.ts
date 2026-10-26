import type { Request, Response } from 'express';
import type { IGetPostConfig } from '../../server/interfaces';
import type { IAssetInfo } from '../assets/@types/public';

const BINARY_CONTENT_TYPE = 'application/octet-stream';
export const ASSET_BINARY_MAX_BYTES = 50 * 1024 * 1024;

interface AssetBinaryManager {
    saveAsset(assetUuid: string, content: Buffer): Promise<IAssetInfo>;
    createAsset(options: { target: string; overwrite: boolean; content: Buffer }): Promise<IAssetInfo>;
}

export interface AssetBinaryRouteDependencies {
    loadAssetManager(): Promise<AssetBinaryManager>;
}

class HttpRequestError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

class RequestAbortedError extends Error {
    constructor() {
        super('Binary request was aborted');
    }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function isOctetStreamRequest(req: Request): boolean {
    const contentType = getHeaderValue(req.headers['content-type']);
    return contentType?.split(';', 1)[0].trim().toLowerCase() === BINARY_CONTENT_TYPE;
}

function isAssetUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function hasOnlyQueryKeys(req: Request, keys: readonly string[]): boolean {
    const allowed = new Set(keys);
    return Object.keys(req.query).every((key) => allowed.has(key));
}

function sendError(res: Response, status: number, error: string): void {
    if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error });
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Aggregates a binary request body locally to the binary Asset routes.
 * The helper keeps the 50 MiB transport policy out of the global JSON parser
 * and checks chunks even when Content-Length is absent or untrusted.
 */
export function readBinaryBody(req: Request, limit = ASSET_BINARY_MAX_BYTES): Promise<Buffer> {
    const contentLength = Number(getHeaderValue(req.headers?.['content-length']));
    if (Number.isFinite(contentLength) && contentLength > limit) {
        return Promise.reject(new HttpRequestError(413, 'Raw binary body exceeds 50 MiB'));
    }

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let length = 0;
        let settled = false;

        const cleanup = () => {
            req.off('data', onData);
            req.off('end', onEnd);
            req.off('error', onError);
            req.off('aborted', onAborted);
        };
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const onData = (chunk: Buffer | Uint8Array | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            length += buffer.length;
            if (length > limit) {
                fail(new HttpRequestError(413, 'Raw binary body exceeds 50 MiB'));
                req.resume();
                return;
            }
            chunks.push(buffer);
        };
        const onEnd = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(Buffer.concat(chunks, length));
        };
        const onError = (error: Error) => fail(error);
        const onAborted = () => fail(new RequestAbortedError());

        req.on('data', onData);
        req.once('end', onEnd);
        req.once('error', onError);
        req.once('aborted', onAborted);
    });
}

function createDefaultDependencies(): AssetBinaryRouteDependencies {
    return {
        async loadAssetManager() {
            const { assetManager } = await import('../assets');
            return assetManager;
        },
    };
}

function handleRouteError(error: unknown, res: Response): void {
    if (error instanceof RequestAbortedError) {
        return;
    }
    if (error instanceof HttpRequestError) {
        sendError(res, error.status, error.message);
        return;
    }
    sendError(res, 500, errorMessage(error));
}

/**
 * Creates the narrow browser-facing binary Asset write routes.
 * All identifier, metadata, body-size, and error translation rules stay here;
 * callers only receive the stable save/create operations.
 */
export function createAssetBinaryRoutes(
    dependencies: AssetBinaryRouteDependencies = createDefaultDependencies(),
): IGetPostConfig[] {
    return [
        {
            url: '/assets/binary/v1/save/:assetUuid',
            async handler(req: Request, res: Response) {
                if (!isOctetStreamRequest(req)) {
                    sendError(res, 415, 'Content-Type must be application/octet-stream');
                    return;
                }
                if (!hasOnlyQueryKeys(req, [])) {
                    sendError(res, 400, 'save does not accept query parameters');
                    return;
                }
                const { assetUuid } = req.params;
                if (!isAssetUuid(assetUuid)) {
                    sendError(res, 400, 'assetUuid must be a UUID');
                    return;
                }

                try {
                    const content = await readBinaryBody(req);
                    const assetManager = await dependencies.loadAssetManager();
                    const result = await assetManager.saveAsset(assetUuid, content);
                    res.status(200).json(result);
                } catch (error) {
                    handleRouteError(error, res);
                }
            },
        },
        {
            url: '/assets/binary/v1/create',
            async handler(req: Request, res: Response) {
                if (!isOctetStreamRequest(req)) {
                    sendError(res, 415, 'Content-Type must be application/octet-stream');
                    return;
                }
                if (!hasOnlyQueryKeys(req, ['target', 'overwrite'])) {
                    sendError(res, 400, 'create accepts only target and overwrite query parameters');
                    return;
                }
                const { target, overwrite } = req.query;
                if (typeof target !== 'string' || !target.startsWith('db://')) {
                    sendError(res, 400, 'target must be a db:// URL');
                    return;
                }
                if (overwrite !== 'true' && overwrite !== 'false') {
                    sendError(res, 400, 'overwrite must be true or false');
                    return;
                }

                try {
                    const content = await readBinaryBody(req);
                    const assetManager = await dependencies.loadAssetManager();
                    const result = await assetManager.createAsset({
                        target,
                        overwrite: overwrite === 'true',
                        content,
                    });
                    res.status(200).json(result);
                } catch (error) {
                    handleRouteError(error, res);
                }
            },
        },
    ];
}
