import type { IAsset } from '../../assets/@types/protected/asset';

let assetNotificationGeneration = 0;
let disposeModuleMessageListeners: (() => void) | null = null;
const assetNotificationQueues = new Map<string, Promise<void>>();

function isScriptAsset(asset: IAsset): boolean {
    return asset.meta.importer === 'typescript' || asset.meta.importer === 'javascript';
}

function enqueueAssetNotification(uuid: string, generation: number, notification: () => Promise<void>): void {
    const previous = assetNotificationQueues.get(uuid) ?? Promise.resolve();
    const current = previous
        .catch((error) => {
            console.error(`[Scene] Asset notification failed (${uuid}):`, error);
        })
        .then(async () => {
            // Scene worker restart/disposal invalidates queued work from the old RPC session.
            if (generation !== assetNotificationGeneration) {
                return;
            }
            await notification();
        });
    const settled = current.catch((error) => {
        console.error(`[Scene] Asset notification failed (${uuid}):`, error);
    });
    assetNotificationQueues.set(uuid, settled);
    void settled.finally(() => {
        if (assetNotificationQueues.get(uuid) === settled) {
            assetNotificationQueues.delete(uuid);
        }
    });
}

export function disposeModuleMessages(): void {
    assetNotificationGeneration++;
    disposeModuleMessageListeners?.();
    disposeModuleMessageListeners = null;
    assetNotificationQueues.clear();
}

export async function listenModuleMessages() {
    disposeModuleMessages();
    const generation = assetNotificationGeneration;
    const { default: scriptManager } = await import('../../scripting');
    const { assetManager } = await import('../../assets');
    const { ScriptProxy } = await import('./proxy/script-proxy');
    const { AssetProxy } = await import('./proxy/asset-proxy');

    // A stop/restart can happen while the dynamic imports above are pending.
    // Do not attach listeners for that invalidated session.
    if (generation !== assetNotificationGeneration) {
        return;
    }

    const onPackBuildEnd = (targetName: string) => {
        if (targetName === 'editor') {
            void ScriptProxy.investigatePackerDriver();
        }
    };
    const onAssetAdded = (asset: IAsset) => {
        if (isScriptAsset(asset)) {
            void ScriptProxy.loadScript();
        }
    };
    const onAssetChanged = (asset: IAsset) => {
        if (isScriptAsset(asset)) {
            void ScriptProxy.scriptChange();
        }
        enqueueAssetNotification(asset.uuid, generation, () => AssetProxy.assetChanged(asset.uuid));
    };
    const onAssetDeleted = (asset: IAsset) => {
        if (isScriptAsset(asset)) {
            void ScriptProxy.removeScript();
        }
        enqueueAssetNotification(asset.uuid, generation, () => AssetProxy.assetDeleted(asset.uuid));
    };

    scriptManager.on('pack-build-end', onPackBuildEnd);
    assetManager.on('asset-add', onAssetAdded);
    assetManager.on('asset-change', onAssetChanged);
    assetManager.on('asset-delete', onAssetDeleted);

    disposeModuleMessageListeners = () => {
        scriptManager.off('pack-build-end', onPackBuildEnd);
        assetManager.off('asset-add', onAssetAdded);
        assetManager.off('asset-change', onAssetChanged);
        assetManager.off('asset-delete', onAssetDeleted);
    };
}
