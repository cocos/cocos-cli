import type { IAsset } from '../../assets/@types/protected/asset';

// 存储监听器引用以便清理
let messageListeners: {
    scriptManager: any;
    assetManager: any;
    handlers: {
        packBuildEnd?: (targetName: string) => void;
        assetAdd?: (asset: IAsset) => void;
        assetChange?: (asset: IAsset) => void;
        assetDelete?: (asset: IAsset) => void;
    };
} | null = null;

export async function listenModuleMessages() {
    // 如果已经监听过，先清理
    if (messageListeners) {
        await unlistenModuleMessages();
    }

    const { default: scriptManager } = await import('../../scripting');
    const { assetManager } = await import('../../assets');
    const { ScriptProxy } = await import('./proxy/script-proxy');
    const { AssetProxy } = await import('./proxy/asset-proxy');

    const handlers = {
        packBuildEnd: (targetName: string) => {
            if (targetName === 'editor') {
                void ScriptProxy.investigatePackerDriver();
            }
        },
        assetAdd: async (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript':
                    void ScriptProxy.loadScript();
                    break;
            }
        },
        assetChange: (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript': {
                    void ScriptProxy.scriptChange();
                    break;
                }
            }
            AssetProxy.assetChanged(asset.uuid).catch(() => {});
        },
        assetDelete: (asset: IAsset) => {
            switch (asset.meta.importer) {
                case 'typescript':
                case 'javascript': {
                    void ScriptProxy.removeScript();
                    break;
                }
            }
            AssetProxy.assetDeleted(asset.uuid).catch(() => {});
        }
    };

    scriptManager.on('pack-build-end', handlers.packBuildEnd);
    assetManager.on('asset-add', handlers.assetAdd);
    assetManager.on('asset-change', handlers.assetChange);
    assetManager.on('asset-delete', handlers.assetDelete);

    // 保存引用
    messageListeners = {
        scriptManager,
        assetManager,
        handlers
    };
}

export async function unlistenModuleMessages() {
    if (!messageListeners) {
        return;
    }

    const { scriptManager, assetManager, handlers } = messageListeners;

    if (handlers.packBuildEnd) {
        scriptManager.off('pack-build-end', handlers.packBuildEnd);
    }
    if (handlers.assetAdd) {
        assetManager.off('asset-add', handlers.assetAdd);
    }
    if (handlers.assetChange) {
        assetManager.off('asset-change', handlers.assetChange);
    }
    if (handlers.assetDelete) {
        assetManager.off('asset-delete', handlers.assetDelete);
    }

    messageListeners = null;
}
