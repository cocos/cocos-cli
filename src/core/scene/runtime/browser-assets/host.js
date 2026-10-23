/** Host-owned adapter: consumers receive functions and never resolve CLI modules. */
export function createBrowserHost(backendBaseUrl) {
    if (!backendBaseUrl) throw new Error('backendBaseUrl is required');
    let loader;
    let environment;
    let capabilities;
    async function getLoader() {
        return loader ??= (async () => {
            const manifestUrl = new URL('scripting/scene-runtime/manifest.json', backendBaseUrl.endsWith('/') ? backendBaseUrl : backendBaseUrl + '/');
            const response = await fetch(manifestUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('CLI browser runtime manifest failed: ' + response.status);
            const manifest = await response.json();
            if (manifest.apiVersion !== 1 || manifest.capabilitiesApiVersion !== 1 || !/^[a-f0-9]{16}$/.test(manifest.buildId)) throw new Error('Browser host requires runtime API 1 with capabilities API 1');
            const url = new URL(manifest.loader, manifestUrl);
            if (url.href !== new URL('./' + manifest.buildId + '/loader.js', manifestUrl).href) throw new Error('Invalid browser runtime loader');
            return import(url.href);
        })();
    }
    return Object.freeze({
        apiVersion: 1,
        async loadEngine(options = {}) {
            return environment ??= (async () => (await getLoader()).loadEngine({ ...options, backendBaseUrl }))();
        },
        async prepareScene(options = {}) {
            return capabilities ??= (async () => {
                const env = await this.loadEngine(options);
                return (await getLoader()).prepareSceneCapabilities(env);
            })();
        },
    });
}
