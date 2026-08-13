declare const cc: any;

export interface ISceneEditorSettings {
    settings?: Record<string, any>;
    bundleConfigs?: Array<{ name: string; deps?: string[] }>;
}

let bundleConfigSignature = '';

export async function fetchSceneEditorSettings(serverURL: string): Promise<ISceneEditorSettings | null> {
    try {
        const url = new URL(`${serverURL}/scene-editor/settings.json`);
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) {
            console.warn(`[scene-editor-assets] Failed to query settings: ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn('[scene-editor-assets] Failed to query settings:', err);
        return null;
    }
}

export function applySceneEditorAssetSettings(config: Record<string, any>, serverURL: string, sceneSettings?: Record<string, any>): void {
    const assets = sceneSettings?.assets;
    if (assets) {
        config.overrideSettings.assets = {
            ...assets,
            server: serverURL,
            importBase: 'assets/general/import',
            nativeBase: 'assets/general/native',
            remoteBundles: [],
            subpackages: [],
        };
    }

    const builtinAssets = sceneSettings?.engine?.builtinAssets;
    if (Array.isArray(builtinAssets)) {
        config.overrideSettings.engine = {
            ...config.overrideSettings.engine,
            builtinAssets,
        };
    }
}

export async function syncSceneEditorBundles(
    serverURL?: string,
    bundleConfigs?: Array<{ name: string; deps?: string[] }>,
): Promise<ISceneEditorSettings | null> {
    const resolvedServerURL = serverURL || (globalThis as any).WebEnv?.serverURL;
    if (!resolvedServerURL) {
        return null;
    }

    let configs = bundleConfigs;
    let settings: ISceneEditorSettings | null = null;
    if (!configs) {
        settings = await fetchSceneEditorSettings(resolvedServerURL);
        configs = settings?.bundleConfigs;
    }
    if (!configs?.length) {
        return settings;
    }

    const signature = JSON.stringify(configs);
    if (signature === bundleConfigSignature) {
        return settings;
    }

    const configMap = new Map<string, { name: string; deps?: string[] }>();
    for (const config of configs) {
        if (config?.name) {
            configMap.set(config.name, config);
        }
    }

    for (const name of configMap.keys()) {
        const bundle = cc.assetManager.getBundle?.(name);
        if (bundle && cc.assetManager.removeBundle) {
            cc.assetManager.removeBundle(bundle);
        }
    }

    const loaded = new Set<string>();
    const loading = new Set<string>();

    async function loadByName(name: string): Promise<void> {
        if (!name || loaded.has(name) || loading.has(name)) {
            return;
        }
        loading.add(name);
        const config = configMap.get(name);
        for (const dep of config?.deps ?? []) {
            if (configMap.has(dep)) {
                await loadByName(dep);
            }
        }

        await new Promise<void>((resolve) => {
            const downloader = cc.assetManager.downloader;
            const previousAppendTimeStamp = downloader?.appendTimeStamp;
            if (downloader && typeof previousAppendTimeStamp === 'boolean') {
                downloader.appendTimeStamp = false;
            }

            try {
                cc.assetManager.loadBundle(`${resolvedServerURL}/scene-editor/assets/${name}`, (err: Error | null) => {
                    if (downloader && typeof previousAppendTimeStamp === 'boolean') {
                        downloader.appendTimeStamp = previousAppendTimeStamp;
                    }
                    if (err) {
                        console.warn(`[scene-editor-assets] Failed to load bundle ${name}:`, err);
                    }
                    resolve();
                });
            } catch (err) {
                if (downloader && typeof previousAppendTimeStamp === 'boolean') {
                    downloader.appendTimeStamp = previousAppendTimeStamp;
                }
                console.warn(`[scene-editor-assets] Failed to load bundle ${name}:`, err);
                resolve();
            }
        });

        loaded.add(name);
        loading.delete(name);
    }

    for (const name of configMap.keys()) {
        await loadByName(name);
    }
    bundleConfigSignature = signature;
    return settings;
}
