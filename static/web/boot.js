/* global window, document, System, globalThis, fetch */
/* eslint-disable quotes */
const env = window.WebEnv;

(async function () {
    try {
        await import("/static/web/polyfills.bundle.js");
        await import("/scripting/systemjs/system.js");
        await import("/scripting/systemjs/extras/named-register.js");

        // Inject import maps. System.import naturally waits for them!
        const map1 = document.createElement('script');
        map1.type = 'systemjs-importmap';
        map1.src = `${env.engineDistPath}/import-map.json`;
        document.head.appendChild(map1);

        const map2 = document.createElement('script');
        map2.type = 'systemjs-importmap';
        map2.src = env.packImportMapURL;
        document.head.appendChild(map2);

        const map3 = document.createElement('script');
        map3.type = 'systemjs-importmap';
        map3.src = '/scripting/import-map-global';
        document.head.appendChild(map3);

        System.setResolutionDetailMapCallback(function () {
            const url = new URL(env.packResolutionDetailMapURL, window.location.href);
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
