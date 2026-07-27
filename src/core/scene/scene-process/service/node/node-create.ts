import type {
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
    Scene,
    instantiate,
    CCObject,
} from 'cc';

import { basename, extname } from 'path';

import { Service } from '../core/decorator';
import { Rpc } from '../../rpc';


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
    canvasRequired?: boolean,
    type?: string,
    workMode?: string,
}): Promise<{ node: Node, canvasRequired: boolean }> {

    const { uuid, type, canvasRequired, workMode } = info;

    let asset;
    let node;
    let newCanvasRequired = canvasRequired ?? false;

    switch (type) {
        case 'cc.AnimationClip':
            {
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                const animation: any = node.addComponent(cc.Animation);
                if (animation) {
                    animation.defaultClip = asset;
                }
            }
            break;
        case 'cc.AudioClip':
            {
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                const audio: any = node.addComponent(cc.AudioSource);
                if (audio) {
                    audio.clip = asset;
                }
            }
            break;
        case 'cc.BitmapFont':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label: any = node.addComponent(cc.Label);
                if (label) {
                    label.font = asset;
                }
            }
            break;
        case 'cc.LabelAtlas':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label: any = node.addComponent(cc.Label);
                if (label) {
                    label.font = asset;
                    label.fontSize = asset.fontSize;
                    if (asset.fntConfig) {
                        const commonHeight = asset.fntConfig.commonHeight;
                        label.lineHeight = commonHeight ? commonHeight : label.lineHeight;
                    }
                }
            }
            break;
        case 'cc.Mesh':
            {
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                const model: any = node.addComponent(cc.MeshRenderer);
                if (model) {
                    model.mesh = asset;
                }
            }
            break;
        case 'cc.ParticleAsset':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                const particle: any = node.addComponent(cc.ParticleSystem2D);
                if (particle) {
                    particle.file = asset;
                }
            }
            break;
        case 'cc.Prefab':
            {
                asset = await loadAny<Prefab>(uuid);
                node = cc.instantiate(asset);
                if (node) {
                    if (node.getComponentsInChildren(UITransform).length > 0) {
                        newCanvasRequired = node.getComponentsInChildren(Canvas).length === 0;
                    }
                }
            }
            break;
        case 'cc.Script':
            {
                let name = (await Service.Script.queryScriptName(uuid)) || '';
                if (!name) {
                    const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
                    if (assetInfo?.name) {
                        name = basename(assetInfo.name, extname(assetInfo.name));
                    }
                }
                const cid: string = (await Service.Script.queryScriptCid(uuid)) || '';
                node = new Node(name);
                if (cid && cid !== 'MissingScript' && cid !== 'cc.MissingScript') {
                    node.addComponent(js.getClassById(cid) as any);
                }
            }
            break;
        case 'cc.SpriteFrame':
            {
                asset = await loadAny<SpriteFrame>(uuid);

                let useSpriteRenderer = false;
                if (workMode === '3d') {
                    const scene = cc.director.getScene();
                    const hasCanvas = scene && scene.getComponentsInChildren(Canvas).length > 0;
                    useSpriteRenderer = !hasCanvas;
                }

                const spritePrefabUuid = '9db8cd0b-cbe4-42e7-96a9-a239620c0a9d';
                const spriteRendererPrefabUuid = '279ed042-5a65-4efe-9afb-2fc23c61e15a';
                const prefabUuid = useSpriteRenderer ? spriteRendererPrefabUuid : spritePrefabUuid;

                const spritePrefabAsset = await loadAny<Prefab>(prefabUuid);
                spritePrefabAsset.name = asset.name;
                node = cc.instantiate(spritePrefabAsset) as Node;
                node.name = asset.name;

                if (useSpriteRenderer) {
                    newCanvasRequired = false;
                    const sprite: any = node.getComponent(cc.SpriteRenderer);
                    if (sprite) {
                        sprite.spriteFrame = asset;
                    }
                } else {
                    newCanvasRequired = true;
                    node.layer = Layers.Enum.UI_2D;
                    const sprite: any = node.getComponent(cc.Sprite);
                    if (sprite) {
                        sprite.spriteFrame = asset;
                    }
                }
            }
            break;
        case 'cc.TTFFont':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label: any = node.addComponent(cc.Label);
                if (label) {
                    label.font = asset;
                }
            }
            break;
        case 'cc.TerrainAsset':
            {
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                const terrain: any = node.addComponent(cc.Terrain);
                if (terrain) {
                    terrain._asset = asset;
                }
            }
            break;
        case 'cc.TiledMapAsset':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const tiledmap: any = node.addComponent(cc.TiledMap);
                if (tiledmap) {
                    tiledmap.tmxAsset = asset;
                }
            }
            break;
        case 'cc.VideoClip':
            {
                newCanvasRequired = true;
                asset = await loadAny(uuid) as any;
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const video: any = node.addComponent(cc.VideoPlayer);
                if (video) {
                    video.clip = asset;
                }
            }
            break;
        case 'dragonBones.DragonBonesAsset':
            {
                if (cc.dragonBones) {
                    newCanvasRequired = true;
                    asset = await loadAny(uuid) as any;
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const dragbone: any = node.addComponent(cc.dragonBones.ArmatureDisplay);
                    if (dragbone) {
                        dragbone.dragonAsset = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = cc.instantiate(asset);
                }
            }
            break;
        case 'dragonBones.DragonBonesAtlasAsset':
            {
                if (cc.dragonBones) {
                    newCanvasRequired = true;
                    asset = await loadAny(uuid) as any;
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const dragbone: any = node.addComponent(cc.dragonBones.ArmatureDisplay);
                    if (dragbone) {
                        dragbone.dragonAtlasAsset = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = cc.instantiate(asset);
                }
            }
            break;
        case 'sp.SkeletonData':
            {
                if (cc.sp) {
                    newCanvasRequired = true;
                    asset = await loadAny(uuid) as any;
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const spSkeleton: any = node.addComponent(cc.sp.Skeleton);
                    if (spSkeleton) {
                        spSkeleton.skeletonData = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = cc.instantiate(asset);
                }
            }
            break;
        default:
            asset = await loadAny(uuid);
            node = cc.instantiate(asset);
            break;
    }

    return {
        node,
        canvasRequired: newCanvasRequired,
    };
}

// 防止多次调用
const pendingCanvasPromises = new Map<Scene, Promise<Node>>();
/**
 * 创建一个隐藏与层级结构的 Canvas 节点
 * @param scene
 * @param workMode
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
        const canvasAssetUuid = 'f773db21-62b8-4540-956a-29bacf5ddbf5';
        // TODO 这里的需要知道当前场景是 2D 还是 3D，如果使用了 2D 的 canvas，
        //  它的 camera 的优先级是为 0，会导致 3D 场景创建了 canvas 运行显示不出 UI 节点
        //  目前先改注释掉，后续场景有 2D/3D 才去做判断
        // if (workMode === '2d') {
        //     canvasAssetUuid = '4c33600e-9ca9-483b-b734-946008261697';
        // }

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
