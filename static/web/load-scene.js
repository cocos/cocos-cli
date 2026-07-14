/* global cc, fetch */

/**
 * 加载并打开场景/预制体。
 *
 * @param {{ services: object, events: object, serverURL: string }} ctx boot() 返回的场景服务上下文
 * @param {string} [urlOrUUID] 场景/预制体 uuid 或 db:// url；缺省时自动挑选第一个用户场景
 */
export async function loadScene(ctx, urlOrUUID) {
    const { services, events, serverURL } = ctx;
    const { Editor } = services;

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

    events.on('editor:open', () => {
        console.log('editor:open onCalled');
    });
    await Editor.open({ urlOrUUID });
}
