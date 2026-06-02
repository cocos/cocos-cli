/* global window, cc, fetch */

window.loadScene = async function (serverURL, urlOrUUID) {
    if (!urlOrUUID) {
        const sceneListPromise = await fetch(`${serverURL}/query-asset-infos/cc.SceneAsset`);
        const sceneList = await sceneListPromise.json();
        const length = sceneList.length;
        for (let i = 0; i < length; i++) {
            const source = sceneList[i].source;
            if (source.startsWith('db://internal')) {
                continue;
            }
            urlOrUUID = sceneList[i].source;
            break;
        }
    }

    if (!urlOrUUID) {
        console.error('No user scene found to load.');
        return;
    }

    cli.SceneEvents.on('editor:open', () => {
        console.log('editor:open onCalled');
    });
    await cli.Scene.Editor.open({ urlOrUUID });
};
