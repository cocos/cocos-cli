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
    Camera,
    Canvas,
    UITransform,
    Animation,
    AudioSource,
    Label,
    MeshRenderer,
    Sprite,
    VideoPlayer,
    ParticleSystem2D,
    SpriteRenderer,
    Terrain,
    TiledMap,
    dragonBones,
    sp,
    Scene,
    director,
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

async function loadCachedOrAny<TAsset extends Asset>(uuid: string): Promise<TAsset> {
    const cached = assetManager.assets.get(uuid) as TAsset | undefined;
    if (cached) {
        return cached;
    }

    return new Promise<TAsset>((resolve, reject) => {
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
    let newCanvasRequired = Boolean(canvasRequired) || getCanvasRequiredByAssetType(type, workMode);

    switch (type) {
        case 'cc.AnimationClip':
            {
                asset = await loadAny<AnimationClip>(uuid);
                node = new Node(asset.name);
                const animation = node.addComponent(Animation);
                if (animation) {
                    animation.defaultClip = asset;
                }
            }
            break;
        case 'cc.AudioClip':
            {
                asset = await loadAny<AudioClip>(uuid);
                node = new Node(asset.name);
                const audio = node.addComponent(AudioSource);
                if (audio) {
                    audio.clip = asset;
                }
            }
            break;
        case 'cc.BitmapFont':
            {
                newCanvasRequired = true;
                asset = await loadAny<BitmapFont>(uuid);
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label = node.addComponent(Label);
                if (label) {
                    label.font = asset;
                }
            }
            break;
        case 'cc.LabelAtlas':
            {
                newCanvasRequired = true;
                asset = await loadAny<LabelAtlas>(uuid);
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label = node.addComponent(Label);
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
                asset = await loadAny<Mesh>(uuid);
                node = new Node(asset.name);
                const model = node.addComponent(MeshRenderer);
                if (model) {
                    model.mesh = asset;
                }
            }
            break;
        case 'cc.ParticleAsset':
            {
                newCanvasRequired = true;
                asset = await loadAny<ParticleAsset>(uuid);
                node = new Node(asset.name);
                const particle = node.addComponent(ParticleSystem2D);
                if (particle) {
                    particle.file = asset;
                }
            }
            break;
        case 'cc.Prefab':
            {
                asset = await loadAny<Prefab>(uuid);
                node = instantiate(asset);
                newCanvasRequired = newCanvasRequired || Boolean(node && getPrefabCanvasRequired(node));
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

                const useSpriteRenderer = shouldUseSpriteRenderer(workMode);

                const spritePrefabUuid = '9db8cd0b-cbe4-42e7-96a9-a239620c0a9d';
                const spriteRendererPrefabUuid = '279ed042-5a65-4efe-9afb-2fc23c61e15a';
                const prefabUuid = useSpriteRenderer ? spriteRendererPrefabUuid : spritePrefabUuid;

                const spritePrefabAsset = await loadAny<Prefab>(prefabUuid);
                spritePrefabAsset.name = asset.name;
                node = instantiate(spritePrefabAsset) as Node;
                node.name = asset.name;

                if (useSpriteRenderer) {
                    const sprite = node.getComponent(SpriteRenderer);
                    if (sprite) {
                        sprite.spriteFrame = asset;
                    }
                } else {
                    newCanvasRequired = true;
                    node.layer = Layers.Enum.UI_2D;
                    const sprite = node.getComponent(Sprite);
                    if (sprite) {
                        sprite.spriteFrame = asset;
                    }
                }
            }
            break;
        case 'cc.TTFFont':
            {
                newCanvasRequired = true;
                asset = await loadAny<TTFFont>(uuid);
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const label = node.addComponent(Label);
                if (label) {
                    label.font = asset;
                }
            }
            break;
        case 'cc.TerrainAsset':
            {
                asset = await loadAny<TerrainAsset>(uuid);
                node = new Node(asset.name);
                const terrain = node.addComponent(Terrain);
                if (terrain) {
                    terrain._asset = asset;
                }
            }
            break;
        case 'cc.TiledMapAsset':
            {
                newCanvasRequired = true;
                asset = await loadAny<TiledMapAsset>(uuid);
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const tiledmap = node.addComponent(TiledMap);
                if (tiledmap) {
                    tiledmap.tmxAsset = asset;
                }
            }
            break;
        case 'cc.VideoClip':
            {
                newCanvasRequired = true;
                asset = await loadAny<VideoClip>(uuid);
                node = new Node(asset.name);
                node.layer = Layers.Enum.UI_2D;
                const video = node.addComponent(VideoPlayer);
                if (video) {
                    video.clip = asset;
                }
            }
            break;
        case 'dragonBones.DragonBonesAsset':
            {
                if (dragonBones) {
                    newCanvasRequired = true;
                    asset = await loadAny<dragonBones.DragonBonesAsset>(uuid);
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const dragbone = node.addComponent(dragonBones.ArmatureDisplay);
                    if (dragbone) {
                        dragbone.dragonAsset = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = instantiate(asset) as unknown as Node;
                }
            }
            break;
        case 'dragonBones.DragonBonesAtlasAsset':
            {
                if (dragonBones) {
                    newCanvasRequired = true;
                    asset = await loadAny<dragonBones.DragonBonesAtlasAsset>(uuid);
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const dragbone = node.addComponent(dragonBones.ArmatureDisplay);
                    if (dragbone) {
                        dragbone.dragonAtlasAsset = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = instantiate(asset) as unknown as Node;
                }
            }
            break;
        case 'sp.SkeletonData':
            {
                if (sp) {
                    newCanvasRequired = true;
                    asset = await loadAny<sp.SkeletonData>(uuid);
                    node = new Node(asset.name);
                    node.layer = Layers.Enum.UI_2D;
                    const spSkeleton = node.addComponent(sp.Skeleton);
                    if (spSkeleton) {
                        spSkeleton.skeletonData = asset;
                    }
                } else {
                    asset = await loadAny(uuid);
                    node = instantiate(asset) as unknown as Node;
                }
            }
            break;
        default:
            asset = await loadAny(uuid);
            node = instantiate(asset) as unknown as Node;
            break;
    }

    return {
        node,
        canvasRequired: newCanvasRequired,
    };
}

/**
 * Resolve the Canvas requirement of an asset without attaching a node to the scene.
 */
export async function queryCanvasRequiredByAsset(info: {
    uuid: string,
    type?: string,
    workMode?: string,
}): Promise<boolean> {
    if (info.type === 'cc.Prefab') {
        const prefab = await loadCachedOrAny<Prefab>(info.uuid);
        const node = instantiate(prefab) as Node;
        try {
            return getPrefabCanvasRequired(node);
        } finally {
            node.destroy();
        }
    }

    return getCanvasRequiredByAssetType(info.type, info.workMode);
}

function getPrefabCanvasRequired(node: Node): boolean {
    return node.getComponentsInChildren(UITransform).length > 0
        && node.getComponentsInChildren(Canvas).length === 0;
}

function getCanvasRequiredByAssetType(type: string | undefined, workMode: string | undefined): boolean {
    switch (type) {
        case 'cc.BitmapFont':
        case 'cc.LabelAtlas':
        case 'cc.ParticleAsset':
        case 'cc.TTFFont':
        case 'cc.TiledMapAsset':
        case 'cc.VideoClip':
            return true;
        case 'cc.SpriteFrame':
            return !shouldUseSpriteRenderer(workMode);
        case 'dragonBones.DragonBonesAsset':
        case 'dragonBones.DragonBonesAtlasAsset':
            return Boolean(dragonBones);
        case 'sp.SkeletonData':
            return Boolean(sp);
        default:
            return false;
    }
}

function shouldUseSpriteRenderer(workMode: string | undefined): boolean {
    if (workMode !== '3d') {
        return false;
    }

    const scene = director.getScene();
    return !scene || scene.getComponentsInChildren(Canvas).length === 0;
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
            // 预览 Canvas 只是编辑期的 UI 管线脚手架, 其自带相机不能参与主窗口渲染:
            // 一旦留在渲染场景里, 场景会被第二台相机重复绘制(UI/粒子出现两份且位置随投影不同而偏移)。
            // 正常路径由 CameraService.onComponentAdded -> detachNewSceneCamera 摘除,
            // 但 instantiate() 走 new ctor() 而非 Node.addComponent(), 不会触发 component:added,
            // 因此这里显式摘除, 与 CameraService._detachSceneCameras 保持一致。
            cameraNode.getComponent(Camera)?.camera?.detachCamera();
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
