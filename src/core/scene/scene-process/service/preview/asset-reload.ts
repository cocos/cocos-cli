import { assetManager } from 'cc';

function getUuidVariants(uuid: string): string[] {
    const variants = new Set<string>([uuid]);
    try {
        const editorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const decompressed = editorExtends?.UuidUtils?.decompressUuid?.(uuid);
        if (decompressed) variants.add(decompressed);
    } catch {
        // UuidUtils is not always available during preview bootstrap.
    }
    return [...variants];
}

export function removePreviewAssetCache(uuid: string): void {
    for (const id of getUuidVariants(uuid)) {
        if (assetManager.assets.has(id)) {
            assetManager.assets.remove(id);
        }
    }
}

interface LoadPreviewAssetOptions {
    reloadAsset?: boolean;
    timeoutMs?: number;
}

export async function loadPreviewAsset<T>(
    uuid: string,
    label: string,
    options: LoadPreviewAssetOptions = {},
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 10000;
    if (options.reloadAsset) {
        removePreviewAssetCache(uuid);
    }
    return await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Load ${label} timeout: ${uuid}`)), timeoutMs);
        const done = (err: any, asset: T) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(asset);
        };
        if (options.reloadAsset) {
            assetManager.loadAny(uuid, { reloadAsset: true }, done);
        } else {
            assetManager.loadAny(uuid, done);
        }
    });
}
