/* global window, document, System, globalThis, fetch */

export default async function boot () {
  try {
    const env = window.WebEnv;
    const envRes = await fetch(`${env.serverURL}/scripting/web-env`);
    Object.assign(env, await envRes.json());

    await import('/static/web/polyfills.bundle.js');
    await import('/scripting/systemjs/system.js');
    await import('/scripting/systemjs/extras/named-register.js');

    // Inject import maps. System.import naturally waits for them!
    const sources = [
        '/scripting/engine-dist/import-map.json',
        '/scripting/x/pack-import-map-url',
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
        const url = new URL('/scripting/x/resolution-detail-map', env.serverURL);
        return fetch(url).then(function (response) {
            return response.json();
        }).then(function (json) {
            return { json, url: url.href };
        });
    });

    await import('/static/web/editor-stub-preload.js');
    await import('/scripting/engine-dist/bundled/index.js');

    const _originalSystem = System;
    console.log('[Scene] loading scene bundle');
    // SystemJS natively awaits the attached import maps above
    const SceneBundle = await System.import('/static/web/scene-bundle.js');
    const { startup } = SceneBundle;

    globalThis.System = _originalSystem;
    await startup({
        enginePath: env.enginePath,
        serverURL: env.serverURL
    });
    console.log('Cocos Engine and Scene Services loaded successfully');
  } catch (err) {
    console.error('Failed to load Cocos Engine or Services:', err.stack || err);
  }
}
