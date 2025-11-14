import type { IAsset } from '../../assets/@types/protected/asset';

export async function listenModuleMessages() {
    const { default: scriptManager } = await import('../../scripting');
    const { assetManager } = await import('../../assets');
    const { ScriptProxy } = await import('./proxy/script-proxy');
    const { AssetProxy } = await import('./proxy/asset-proxy');

    scriptManager.on('pack-build-end', (targetName: string) => {
        if (targetName === 'editor') {
            void ScriptProxy.investigatePackerDriver();
        }
    });

    assetManager.on('asset-add', async (asset: IAsset) => {
        switch (asset.meta.importer) {
            case 'typescript':
            case 'javascript':
                void ScriptProxy.loadScript();
                break;
        }
    });

    assetManager.on('asset-change', (asset: IAsset) => {
        switch (asset.meta.importer) {
            case 'typescript':
            case 'javascript': {
                void ScriptProxy.scriptChange();
                break;
            }
        }
        AssetProxy.assetChanged(asset.uuid).catch((err) => {});
    });

    assetManager.on('asset-delete', (asset: IAsset) => {
        switch (asset.meta.importer) {
            case 'typescript':
            case 'javascript': {
                void ScriptProxy.removeScript();
                break;
            }
        }
        AssetProxy.assetDeleted(asset.uuid).catch((err) => {});
    });
}
