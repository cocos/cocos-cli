import type {
    Mesh,
    VideoClip,
    BitmapFont,
    TTFFont,
    LabelAtlas,
    ParticleAsset,
    AnimationClip,
    AudioClip,
    TerrainAsset,
    TiledMapAsset,
    Asset,
    Prefab,
    SpriteFrame,
} from 'cc';

import {
    js,
    assetManager,
    Node,
    Layers,
    Canvas,
    UITransform,
    Animation,
    AudioSource,
    Label,
    MeshRenderer,
    Sprite,
    VideoPlayer,
    ParticleSystem2D,
    director,
    SpriteRenderer,
    Terrain,
    TiledMap,
    dragonBones,
    sp,
    Scene,
    instantiate,
    CCObject,
} from 'cc';


/**
 * 根据资源 uuid 加载资源
 * @param uuid
 */
export async function loadAny<TAsset extends Asset>(uuid: string): Promise<TAsset> {
    return new Promise<TAsset>((resolve, reject) => {
        assetManager.assets.remove(uuid);
        assetManager.loadAny<TAsset>(uuid, (error, asset) => {
            if (error) {
                reject(error);
            } else {
                resolve(asset);
            }
        });
    });
}

export async function createNodeByAsset(info: {
    uuid: string,
    canvasRequired: boolean,
}): Promise<{ node: Node, canvasRequired: boolean }> {

    const { uuid, canvasRequired } = info;
    const asset = await loadAny(uuid);
    const node = cc.instantiate(asset);

    return {
        node,
        canvasRequired: canvasRequired,
    };
}

// 防止多次调用
const pendingCanvasPromises = new Map<Scene, Promise<Node>>();
/**
 * 创建一个隐藏与层级结构的 Canvas 节点
 * @param scene
 */
export async function createShouldHideInHierarchyCanvasNode(scene: Scene, workMode = '2d') {
    // 1. 优先查找已有节点
    const existingCanvas = scene.getComponentsInChildren(Canvas).find(
        (c: Canvas) => c.node.name === 'should_hide_in_hierarchy');

    if (existingCanvas) {
        return existingCanvas.node;
    }

    // 2. 检查并处理并发请求
    if (pendingCanvasPromises.has(scene)) {
        return pendingCanvasPromises.get(scene)!;
    }

    const creationPromise = (async () => {
        let canvasAssetUuid = 'f773db21-62b8-4540-956a-29bacf5ddbf5';
        if (workMode === '2d') {
            canvasAssetUuid = '4c33600e-9ca9-483b-b734-946008261697';
        }

        const canvasAsset = await loadAny<Prefab>(canvasAssetUuid);
        // 实例化后是一个 prefab, 需要继续 unlink prefab
        const canvasNode: Node = instantiate(canvasAsset);

        // 处理新增加的 camera 节点，编辑器已经有特殊处理显示，节点可以删除以便不显示在 hierarchy 中
        canvasNode.children.forEach((child: Node) => {
            child.objFlags |= CCObject.Flags.HideInHierarchy;
        });
        // 成为一个普通节点
        canvasNode['_prefab'] = null;
        canvasNode.parent = scene;
        canvasNode.name = 'should_hide_in_hierarchy';
        canvasNode.objFlags |= CCObject.Flags.LockedInEditor;

        const cameraNode = canvasNode.children[0];
        if (cameraNode) {
            cameraNode.setParent = () => {
                console.error('It is forbidden to modify the parent node of the internal camera node.');
            };
        }

        return canvasNode;
    })();

    pendingCanvasPromises.set(scene, creationPromise);

    try {
        return await creationPromise;
    } finally {
        pendingCanvasPromises.delete(scene);
    }
}
