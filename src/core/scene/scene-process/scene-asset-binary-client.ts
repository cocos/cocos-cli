import type { IAssetInfo } from '../../assets/@types/public';
import { Rpc } from './rpc';

export interface SceneAssetBinaryCreateOptions {
    target: string;
    overwrite: boolean;
    content: Uint8Array;
}

export interface SceneAssetBinaryClientDependencies {
    getWebServerUrl(): string | undefined;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    saveLocally(assetUuid: string, content: Uint8Array): Promise<IAssetInfo>;
    createLocally(options: SceneAssetBinaryCreateOptions): Promise<IAssetInfo>;
}

function errorMessage(responseBody: string): string {
    try {
        const parsed = JSON.parse(responseBody) as { error?: unknown };
        if (typeof parsed.error === 'string' && parsed.error) {
            return parsed.error;
        }
    } catch {
        // The HTTP status remains useful even if an intermediary returned non-JSON.
    }
    return responseBody || 'Unknown error';
}

function parseAssetInfo(responseBody: string): IAssetInfo {
    try {
        return JSON.parse(responseBody) as IAssetInfo;
    } catch (error) {
        throw new Error(`Scene binary asset response is not valid JSON: ${errorMessage(error instanceof Error ? error.message : String(error))}`);
    }
}

function createDefaultDependencies(): SceneAssetBinaryClientDependencies {
    return {
        getWebServerUrl: () => Rpc.getWebServerUrl(),
        fetch: (...args) => fetch(...args),
        saveLocally: (assetUuid, content) => Rpc.getInstance().request('assetManager', 'saveAsset', [
            assetUuid,
            Buffer.from(content),
        ]) as Promise<IAssetInfo>,
        createLocally: ({ target, overwrite, content }) => Rpc.getInstance().request('assetManager', 'createAsset', [{
            target,
            overwrite,
            content: Buffer.from(content),
        }]) as Promise<IAssetInfo>,
    };
}

/**
 * The only scene-process interface for binary Asset writes.
 * It hides the web HTTP protocol while keeping native Scene workers on IPC.
 */
export class SceneAssetBinaryClient {
    constructor(private readonly dependencies: SceneAssetBinaryClientDependencies = createDefaultDependencies()) {
    }

    async save(assetUuid: string, content: Uint8Array): Promise<IAssetInfo> {
        const serverUrl = this.dependencies.getWebServerUrl();
        if (!serverUrl) {
            return this.dependencies.saveLocally(assetUuid, content);
        }
        return this.request(serverUrl, `/assets/binary/v1/save/${encodeURIComponent(assetUuid)}`, content);
    }

    async create(options: SceneAssetBinaryCreateOptions): Promise<IAssetInfo> {
        const serverUrl = this.dependencies.getWebServerUrl();
        if (!serverUrl) {
            return this.dependencies.createLocally(options);
        }
        const query = new URLSearchParams({
            target: options.target,
            overwrite: String(options.overwrite),
        });
        return this.request(serverUrl, `/assets/binary/v1/create?${query.toString()}`, options.content);
    }

    private async request(serverUrl: string, path: string, content: Uint8Array): Promise<IAssetInfo> {
        const response = await this.dependencies.fetch(`${serverUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: content as unknown as BodyInit,
        });
        const responseBody = await response.text();
        if (!response.ok) {
            throw new Error(`Scene binary asset request failed with status ${response.status}: ${errorMessage(responseBody)}`);
        }
        return parseAssetInfo(responseBody);
    }
}

export const sceneAssetBinaryClient = new SceneAssetBinaryClient();
