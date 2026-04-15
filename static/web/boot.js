/* global window, document, System, globalThis, fetch */
/* eslint-disable quotes */
const env = window.WebEnv;

(async function () {
    try {
        await import("/static/web/polyfills.bundle.js");
        await import("/scripting/systemjs/system.js");
        await import("/scripting/systemjs/extras/named-register.js");

        // Inject import maps. System.import naturally waits for them!
        const sources = [
            `${env.engineDistPath}/import-map.json`,
            env.packImportMapURL,
            '/scripting/import-map-global'
        ];
        sources.forEach(src => {
            const script = document.createElement('script');
            Object.assign(script, {
                type: 'systemjs-importmap',
                src
            });
            document.head.appendChild(script);
        });

        System.setResolutionDetailMapCallback(function () {
            const url = new URL(env.packResolutionDetailMapURL, env.serverURL);
            return fetch(url).then(function (response) {
                return response.json();
            }).then(function (json) {
                return { json, url: url.href };
            });
        });

        await import("/static/web/editor-stub-preload.js");
        await import(`${env.engineDistPath}/bundled/index.js`);

        const _originalSystem = System;
        console.log('[Scene] loading scene bundle');
        // SystemJS natively awaits the attached import maps above
        const SceneBundle = await System.import('/static/web/scene-bundle.js?t=' + Date.now());
        const { startup } = SceneBundle;

        globalThis.System = _originalSystem;
        await startup({
            enginePath: env.enginePath,
            projectPath: env.projectPath,
            serverURL: env.serverURL
        });
        console.log('Cocos Engine and Scene Services loaded successfully');
    } catch (err) {
        console.error('Failed to load Cocos Engine or Services:', err.stack || err);
    }
})();
