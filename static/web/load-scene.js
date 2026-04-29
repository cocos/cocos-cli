/* global window, cc, fetch, setupInputBridge */

window.loadScene = async function (serverURL) {
    const sceneListPromise = await fetch(`${serverURL}/query-asset-infos/cc.SceneAsset`);
    const sceneList = await sceneListPromise.json();
    const length = sceneList.length;
    let sceneUrl = null;
    for (let i = 0; i < length; i++) {
        const source = sceneList[i].source;
        if (source.startsWith('db://internal')) {
            continue;
        }
        sceneUrl = sceneList[i].source;
        break;
    }

    if (!sceneUrl) {
        console.error('No user scene found to load.');
        return;
    }

    cli.SceneEvents.on('editor:open', () => {
        console.log('editor:open onCalled');
    });

    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/static/web/input-bridge.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });

    var canvas = document.getElementById('GameCanvas');
    if (canvas && cli.Scene.Operation) {
        setupInputBridge({
            canvas: canvas,
            operation: cli.Scene.Operation,
            engine: cli.Scene.Engine,
        });
    }

    await cli.Scene.Editor.open({ urlOrUUID: sceneUrl });
};
