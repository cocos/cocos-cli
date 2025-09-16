/* eslint-disable no-useless-escape */
'use strict';

import { Asset, queryAsset } from '@editor/asset-db';
import { nameToId } from '@editor/asset-db/libs/utils';
import * as cc from 'cc';
import { existsSync, readJSON, readJsonSync, writeFileSync, writeFile, writeJSONSync, copyFile } from 'fs-extra';
import { join } from 'path';
import { glTfReaderManager } from '../gltf/reader-manager';
import { getComponent, walk, walkAsync, getPrefabOfNode, walkPrefabInstances } from './utils';
import { Widget } from '../migrates/components';
import { beforeMigratePrefab, migratePrefab } from '../migrates/prefab';
import { Archive, MigrationSwapSpace } from '../utils/migration-utils';
import { migrateCurveRange330 } from '../migrates/migrate-curve-range-3-3-0';
import { migrateGeometryCurve330 } from '../migrates/migrate-geometry-curve-3-3-0';
import { migratePrefabInstanceRoots } from './migrate-prefab-1-1-34';
import { linearToSRGB } from '../utils/equirect-cubemap-faces';
import utils from '../../../../base/utils';
import profile from '../../../../profile';
import assetConfig from '../../../asset-config';
import { assetDBManager } from '../../../manager/asset-db';
import { GlobalPaths } from '../../../../../global';

/////////////////
// 版本升级

export const migrations = [
    {
        version: '1.0.4',
        migrate: migrateImageUuid,
    },
    {
        version: '1.0.5',
        migrate: migrateSkinningRoot,
    },
    {
        version: '1.0.6',
        migrate: migrateAnimationName,
    },
    // {
    //     version: '1.0.7',
    //     migrate: migrateSockets,
    // },
    {
        version: '1.0.13',
        migrate: migrateVisibility,
    },
    {
        version: '1.0.14',
        migrate: migrateClearFlags,
    },
    {
        version: '1.0.15',
        migrate: async (asset: Asset) => {
            await migrateNameToId(asset, true);
        },
    },
    {
        version: '1.0.16',
        migrate: migrateDefaultLayer,
    },
    {
        version: '1.0.18',
        migrate: migrateCameraVisibility,
    },
    {
        version: '1.0.20',
        migrate: migrateNameToId,
    },
    {
        version: '1.0.21',
        migrate: migrateWidgetComponent,
    },
    {
        version: '1.0.22',
        migrate: migrateUIPriority,
    },
    {
        version: '1.0.23',
        migrate: migrateSkybox,
    },
    {
        version: '1.0.24',
        migrate: migrateSkinningMaterial,
    },
    {
        version: '1.0.25',
        migrate: migrateBackSkinningMaterial,
    },
    {
        version: '1.0.26',
        migrate: migrateSkinningMaterialForMeshSplit,
    },
    {
        version: '1.0.27',
        migrate: migrateCapsuleColliderHeight,
    },
    {
        version: '1.0.28',
        migrate: migrateParticleModule,
    },
    {
        version: '1.0.29',
        migrate: migrateParticleComponentModule,
    },
    {
        version: '1.0.31',
        migrate: async (asset: Asset) => {
            // 由于目前 ui 的结构问题，所以之前的 migrate 进行了回退，暂时注释掉
            // await migrateScrollAndPageViewComponenetModule(asset, 'cc.ScrollViewComponent');
            // await migrateScrollAndPageViewComponenetModule(asset, 'cc.PageViewComponent');
        },
    },
    {
        version: '1.0.32',
        migrate: migrateShadow,
    },
    {
        version: '1.1.0',
        migrate: migrateComponentNames,
    },
    {
        version: '1.1.20',
        migrate: migrateClickEventsNames,
    },
    {
        version: '1.1.21',
        migrate: migrateCanvasAddWidget,
    },
    {
        version: '1.1.22',
        migrate: migrateRigidBody,
    },
    {
        version: '1.1.23',
        migrate: migrateUICustomMaterial,
    },
    {
        version: '1.1.24',
        migrate: migrateVisibilityTypeError,
    },
    {
        version: '1.1.25',
        migrate: migrateUILayout,
    },
    {
        version: '1.1.26',
        migrate: migrateCanvasCamera,
    },
    {
        version: '1.1.27',
        migrate: async (asset: Asset) => {
            const swap: any = asset.getSwapSpace();
            const json: any[] = swap.json || (await readJSON(asset.source));

            await migratePrefabCompPrefabInfo(asset);
            await beforeMigratePrefab(asset);
            await migratePrefab(asset);

            if (json) {
                // 复制一份数据，因为前面的迁移使用了缓存数据，如果 swap 直接给缓存数据，会导致需要使用缓存的地方出现错误
                swap.json = JSON.parse(JSON.stringify(json));
            }
        },
    },
    {
        version: '1.1.29',
        migrate: async (asset: Asset) => {
            await migrateShadowInfo(asset);
        },
    },
    {
        version: '1.1.30',
        migrate: migrateGeometryCurveCurveRange330,
    },
    {
        version: '1.1.31',
        migrate: async (asset: Asset) => {
            await migrateShadowDepthBias(asset);
        },
    },
    {
        version: '1.1.32',
        migrate: async (asset: Asset) => {
            await migratePrivateNode(asset);
        },
    },
    {
        version: '1.1.33',
        migrate: async (asset: Asset) => {
            await migrateShadowAutoAdapt(asset);
        },
    },
    {
        version: '1.1.34',
        migrate: async (asset: Asset) => {
            await migratePrefabInstanceRoots(asset);
        },
    },
    {
        version: '1.1.35',
        migrate: async (asset: Asset) => {
            await migrateHDRData(asset);
            await migrateFogData(asset);
        },
    },
    {
        version: '1.1.36',
        migrate: async (asset: Asset) => {
            await migrateSkyLightingTypeData(asset);
        },
    },
    {
        version: '1.1.37',
        migrate: async (asset: Asset) => {
            await migrateShadowsData(asset);
        },
    },
    {
        version: '1.1.38',
        migrate: async (asset: Asset) => {
            await migratePunctualLightLuminance(asset);
        },
    },
    {
        version: '1.1.39',
        migrate: async (asset: Asset) => {
            await migrateCSMData(asset);
        },
    },
    {
        version: '1.1.40',
        migrate: async (asset: Asset) => {
            await migrateMaskImageStencil(asset);
        },
    },
    {
        version: '1.1.41',
        migrate: async (asset: Asset) => {
            await migrateLightBakeable(asset);
        },
    },
    {
        version: '1.1.42',
        migrate: async (asset: Asset) => {
            await migrateBakeSettings(asset);
        },
    },
    {
        version: '1.1.43',
        migrate: async (asset: Asset) => {
            // prefab ids 方案还原了,暂不升级（改了预制体，场景的ids需要编辑一次才能同步）
            // const ret = await migratePrefabInstanceIds(asset);
            // if (!ret) {
            //     console.warn(`Failed:add prefab instance ids to scene:${asset.source},please open and save it manually`);
            // }
        },
    },
    {
        version: '1.1.46',
        migrate: async (asset: Asset) => {
            await migratePrefabParentNull(asset);
        },
    },
    {
        version: '1.1.47',
        migrate: async (asset: Asset) => {
            await migrateFXAA(asset);
        },
    },
    {
        version: '1.1.48',
        migrate: async (asset: Asset) => {
            await migrateMaskImageStencilSizeMode(asset);
        },
    },
    {
        version: '1.1.50',
        migrate: async (asset: Asset) => {
            await migrateLabelOutlineAndShadow(asset);
            await migrateBloomThreshold(asset);
        },
    },
];

/**
 * ImageAsset 导入之前使用文件名作为 subAsset 的名字
 * 这样会导致文件名更改的时候 subAsset name 也更改，导致之前的索引丢失
 * 所以现在 ImageAsset 的 subAsset 使用 type 作为 name
 * 这里将所有指向 image 的 subAsset 的资源都进行一次检查，替换成指定的名字
 * @param asset
 */
export async function migrateImageUuid(asset: Asset) {
    // const assetDB = asset._assetDB;
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    // 遍历 object，查找带有 __uuid__ 的对象
    walk(json, (object: object) => {
        if (!('__uuid__' in object)) {
            return;
        }

        // @ts-ignore
        const uuid: string = object.__uuid__;

        // 只查找带有 @ 的 subAsset 数据
        if (!/@/.test(uuid)) {
            return;
        }

        // 替换成新的 subAsset name
        const uuids = uuid.split('@');
        let asset: Asset | undefined;
        const item = queryAsset(uuids[0]) as Asset;
        if (item) {
            asset = item;
        }
        if (asset && asset.meta.importer === 'image') {
            switch (asset.meta.userData.type) {
                case 'raw':
                    break;
                case 'texture':
                    uuids[1] = 'texture';
                    break;
                case 'normal map':
                    uuids[1] = 'normalMap';
                    break;
                case 'texture cube':
                    uuids[1] = 'textureCube';
                    break;
                case 'sprite-frame':
                    uuids[1] = 'spriteFrame';
                    break;
            }
        }
        // @ts-ignore
        object.__uuid__ = uuids.join('@');
    });
    // writeJSONSync(asset.source, json, {
    //     spaces: 2,
    // });
}

///////////////////////////////////////////////

const animationRE = /AnimationComponent/i;
const skinningRE = /SkinningModelComponent/i;
/**
 * 之前 skinning model 是用 skeleton 的 lowest common ancestor 作为 skinning root，
 * 重构后 skinning root 统一改为 animatino component 所在节点，需要迁移这个属性
 * @param asset
 */
async function migrateSkinningRoot(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const comp of json) {
        if (!skinningRE.test(comp.__type__)) {
            continue;
        }
        const oldRoot = comp._skinningRoot && comp._skinningRoot.__id__;
        if (getComponent(json, oldRoot, animationRE)) {
            continue;
        }
        let targetID = comp.node.__id__;
        while (targetID === comp.node.__id__ || !getComponent(json, targetID, animationRE)) {
            const parent = json[targetID]._parent;
            targetID = (parent && parent.__id__) || null;
        }
        if (targetID !== null) {
            comp._skinningRoot = { __id__: targetID };
        }
    }
    writeJSONSync(asset.source, json, {
        spaces: 2,
    });
}

///////////////////////////////////////////////

/**
 * GLTF 导入的 subAsset 名字之前如果有特殊字符，会替换成 -
 * 现在 db 支持了特殊字符，所以要将原来名字有 - 的资源进行一次检查
 * 如果父资源内有除了特殊字符外都相等的资源，则直接替换掉索引
 * @param asset
 */
export async function migrateAnimationName(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    // 遍历 object，查找带有 __uuid__ 的对象
    await walkAsync(json, async (object: object) => {
        if (!('__uuid__' in object)) {
            return;
        }

        // @ts-ignore
        const uuid: string = object.__uuid__;

        // 只查找带有 @ 的 subAsset 数据
        if (!/@/.test(uuid)) {
            return;
        }

        // 替换成新的 subAsset name
        const uuids = uuid.split('@');
        let sub: Asset | undefined;
        const item = queryAsset(uuids[0]) as Asset;
        if (item) {
            sub = item;
        }
        if (sub) {
            asset._assetDB.taskManager.pause(asset.task);
            await sub.waitInit();
            asset._assetDB.taskManager.resume(asset.task);

            Object.keys(sub.subAssets).some((name: string) => {
                // eslint-disable-next-line no-control-regex
                const replace = name.replace(/[ <>:'#\/\\|?*\x00-\x1F]/g, '-');
                if (uuids[1] === replace) {
                    uuids[1] = name;
                    return true;
                }
            });
        }
        // @ts-ignore
        object.__uuid__ = uuids.join('@');
    });

    writeJSONSync(asset.source, json, {
        spaces: 2,
    });
}

///////////////////////////////////////////////

// @ts-ignore
const MissingClass = EditorExtends.MissingReporter.classInstance;
function classFinder(type: any, data: any, owner: any, propName: any) {
    const res = MissingClass.classFinder(type, data, owner, propName);
    if (res) {
        return res;
    }
    return cc.MissingScript;
}
classFinder.onDereferenced = MissingClass.classFinder.onDereferenced;

/**
 * 迁移挂点模型到新 socket 系统
 * @param asset
 */
// function isParentOf(parent: cc.Node, child: cc.Node | null) {
//     if (parent !== child) {
//         while (child) {
//             if (child === parent) { return true; }
//             child = child.parent;
//         }
//     }
//     return false;
// }
// function createSockets(sceneNode: cc.Node) {
//     if (!sceneNode.getComponentInChildren(cc.SkinningModelComponent)) { return []; }
//     const renderables = sceneNode.getComponentsInChildren(cc.RenderableComponent);
//     const sockets: cc.Socket[] = [];
//     // do a gathering pass first
//     const candidates: cc.Node[] = [];
//     for (const renderable of renderables) {
//         // general cases
//         let model = renderable.node! as cc.Node;
//         // handle skinning models
//         if (renderable instanceof cc.SkinningModelComponent) {
//             // @ts-ignore TS2445
//             const skinningRoot = renderable._skinningRoot as cc.Node;
//             if (skinningRoot === sceneNode) { continue; }
//             if (skinningRoot) { model = skinningRoot; }
//         }
//         candidates.push(model);
//     }
//     // remove nested candidates
//     for (let i = 0; i < candidates.length; i++) {
//         const candidate = candidates[i];
//         if (candidates.some((node) => isParentOf(node, candidate))) {
//             candidates[i] = candidates[candidates.length - 1];
//             candidates.length--; i--;
//         }
//     }
//     for (const candidate of candidates) {
//         do_create_socket(sceneNode, sockets, candidate);
//     }
//     return sockets;
// }
// export async function migrateSockets(asset: Asset) {
//     // @ts-ignore TS2339
//     const tdInfo = cc.deserialize.Details.pool.get()!;
//     const swap: any = asset.getSwapSpace();
//     const json: any[] = swap.json || await readJSON(asset.source);

//     MissingClass.hasMissingClass = false;
//     const resource = cc.deserialize(json, tdInfo, {
//         createAssetRefs: true,
//         ignoreEditorOnly: false,
//         classFinder,
//     }) as cc.SceneAsset | cc.Prefab;
//     const scene = resource instanceof cc.SceneAsset ? resource.scene : resource.data;
//     for (const comp of scene.getComponentsInChildren(cc.SkinningModelComponent)) {
//         const root = comp._skinningRoot;
//         if (!root) { continue; }
//         const anim = root.getComponent(cc.AnimationComponent);
//         if (anim && anim instanceof cc.SkeletalAnimationComponent) { continue; }
//         // replace with skeletal animation component
//         let clips: Array<cc.AnimationClip | null> = []; let defaultClip: cc.AnimationClip | null = null; let oldIdx = 0;
//         if (anim) {
//             clips = anim._clips; defaultClip = anim._defaultClip;
//             oldIdx = root._components.findIndex((c: any) => c === anim);
//             root._components.splice(oldIdx, 1);
//         }
//         const skeletalAnim = root.addComponent(cc.SkeletalAnimationComponent);
//         root._components.pop(); root._components.splice(oldIdx, 0, skeletalAnim);
//         if (clips.length) { skeletalAnim._clips = clips; }
//         if (defaultClip) { skeletalAnim._defaultClip = defaultClip; }
//         skeletalAnim.playOnLoad = true;
//         skeletalAnim._sockets = createSockets(root);
//     }

//     // @ts-ignore
//     await writeFile(asset.source, EditorExtends.serialize(resource));
//     MissingClass.reset();
// }

/**
 * 将场景的 Transform 信息进行归一化处理，并且将 scene 上的组件置空
 */
async function migrateNormalizeScene(asset: Asset) {
    if (asset.extname !== '.scene') {
        return;
    }
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    // @ts-ignore TS2339
    const tdInfo = cc.deserialize.Details.pool.get()!;
    MissingClass.hasMissingClass = false;
    const resource = cc.deserialize(json, tdInfo, {
        createAssetRefs: true,
        ignoreEditorOnly: false,
        classFinder,
    }) as cc.SceneAsset;

    if (resource instanceof cc.SceneAsset) {
        /** hack for old beta version, scene changed after v1.0.1 */
        const scene = resource.scene as any;
        if (scene !== null) {
            if (scene._lpos) {
                scene._lpos.x = scene._lpos.y = scene._lpos.z = 0;
            }

            if (scene._lscale) {
                scene._lscale.x = scene._lscale.y = scene._lscale.z = 1;
            }

            if (scene._lrot) {
                scene._lrot.x = scene._lrot.y = scene._lrot.z = 0;
                scene._lrot.w = 1;
            }

            if (scene._euler) {
                scene._euler.x = scene._euler.y = scene._euler.z = 0;
            }

            if (scene._components) {
                scene._components = [];
            }
        }
    }

    // @ts-ignore
    writeFileSync(asset.source, EditorExtends.serialize(resource));
    MissingClass.reset();
}

///////////////////////////////////////////////

const cameraRE = /CameraComponent/i;

async function migrateVisibility(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const comp of json) {
        if (cameraRE.test(comp.__type__)) {
            comp._visibility = (1 << 30) | (1 << 29) | (1 << 23);
        }

        if (comp._visFlags !== undefined) {
            comp._visFlags &= ~(1 << 30);
        }

        if (comp.node) {
            const layer = json[comp.node.__id__]._layer;

            // IgnoreRaycast
            if (layer & (1 << 1)) {
                json[comp.node.__id__]._layer &= ~(1 << 1);
                json[comp.node.__id__]._layer |= 1 << 20;
            }
            // Gizmos
            if (layer & (1 << 2)) {
                json[comp.node.__id__]._layer &= ~(1 << 2);
                json[comp.node.__id__]._layer |= 1 << 21;
            }
            // Editor
            if (layer & (1 << 3)) {
                json[comp.node.__id__]._layer &= ~(1 << 3);
                json[comp.node.__id__]._layer |= 1 << 22;
            }
            // UI
            if (layer & (1 << 4)) {
                json[comp.node.__id__]._layer &= ~(1 << 4);
                json[comp.node.__id__]._layer |= 1 << 23;
            }
            json[comp.node.__id__]._layer |= 1 << 30;
        }
    }
}

async function migrateClearFlags(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    const skyboxRE = /SkyboxInfo/i;
    const info = json.find((c) => skyboxRE.test(c.__type__));
    if (!info || !info._enabled) {
        return;
    }
    for (const comp of json) {
        if (cameraRE.test(comp.__type__)) {
            comp._clearFlags = cc.Camera.ClearFlag.SKYBOX;
        }
    }
}

///////////////////////////////////////////////

export async function migrateNameToId(asset: Asset, ignore: boolean) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    // 遍历 object，查找带有 __uuid__ 的对象
    walk(json, (object: object) => {
        // @ts-ignore
        const uuid: string = object.__uuid__;

        // 只查找带有 @ 的 subAsset 数据
        if (!/@/.test(uuid)) {
            return;
        }

        // 替换成新的 subAsset id
        const uuids = uuid.split('@');

        if (uuids.length <= 1) {
            return;
        }

        for (let i = 1; i < uuids.length; i++) {
            uuids[i] = nameToId(uuids[i]);
        }

        const _uuid = uuids.join('@');
        if (ignore === true || queryAsset(_uuid)) {
            // @ts-ignore
            object.__uuid__ = _uuid;
        }
    });
}

///////////////////////////////////////////////

/**
 * 将_layer从 1073741825 变为 1073741824(1<<30)
 * @param asset
 */
export async function migrateDefaultLayer(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const comp of json) {
        if (comp.node) {
            const layer: number = json[comp.node.__id__]._layer;
            if (layer === 1073741825) {
                json[comp.node.__id__]._layer = 1073741824;
            }
        }
    }
}

///////////////////////////////////////////////

/**
 * 编辑 prefab 后保存的数据错误了
 * @param asset
 */
export async function migrateSavePrefabInfo(asset: Asset) {
    if (asset.extname !== '.prefab') {
        return;
    }

    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    // 可能多出 cc.Scene
    // 可能缺少 cc.PrefabInfo
    let hasScene = false;
    let hasPrefabInfo = false;
    for (const comp of json) {
        if (comp.__type__.startsWith('cc.Scene')) {
            hasScene = true;
        }

        if (comp.__type__.startsWith('cc.PrefabInfo')) {
            hasPrefabInfo = true;
        }
    }

    if (!hasScene && hasPrefabInfo) {
        return; // 正常的数据结构
    }

    // @ts-ignore TS2339
    const tdInfo = cc.deserialize.Details.pool.get()!;
    MissingClass.hasMissingClass = false;
    const prefabNode = cc.deserialize(json, tdInfo, {
        createAssetRefs: true,
        ignoreEditorOnly: false,
        classFinder,
    }) as cc.Prefab;
    prefabNode.data.parent = null;

    link(prefabNode.data, prefabNode);

    // @ts-ignore
    swap.json = JSON.parse(EditorExtends.serialize(prefabNode));

    // 重新关联资源，使 cc.PrefabInfo 正常出现
    function link(node: cc.Node, asset: cc.Prefab | null) {
        // @ts-ignore TS2445
        const parentPrefab = node.parent && node.parent._prefab;

        const info = new cc.Prefab._utils.PrefabInfo();
        info.asset = asset || parentPrefab?.asset;
        info.root = (parentPrefab && parentPrefab.root) || node;
        // 重要：原本就有 _prefab 属性，复用 fileId，会在 prefab 从资源还原的时候使用
        // @ts-ignore TS2445
        info.fileId = node._prefab ? node._prefab.fileId : node.uuid;
        // @ts-ignore TS2445
        node._prefab = info;

        if (Array.isArray(node.children)) {
            node.children.forEach((child) => {
                // @ts-ignore TS2445
                if (child.parent && child.parent._prefab) {
                    link(child, null);
                }
            });
        }
    }
    MissingClass.reset();
}

/**
 * 最新发现将 prefab 子节点拖为新的 prefab 资源，
 * 会序列化出含有 cc.Scene 的错误数据
 * @param asset
 */
export function migrateSavePrefabInfoAgain(asset: Asset) {
    migrateSavePrefabInfo(asset);
}

///////////////////////////////////////////////

async function migrateCameraVisibility(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    json.forEach((object: any) => {
        if (object.__type__ === 'cc.CameraComponent') {
            if (object._visibility === 1619001344) {
                object._visibility = 1822425087;
            } else if (object._visibility === 1610612736) {
                object._visibility = 1822425087;
            }
        } else if (object.__type__ === 'cc.Node' || object.__type__ === 'cc.Scene') {
            if (object._layer === 1) {
                object._layer = 1073741824;
            }
        }
    });
}

///////////////////////////////////////////////

/**
 * widgetComponent 的对齐百分比数据迁移
 * @param asset
 */
export async function migrateWidgetComponent(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const comp of json) {
        if (comp.__type__ === 'cc.WidgetComponent') {
            if (!comp._isAbsLeft && comp._left !== 0) {
                comp._left /= 100;
            }
            if (!comp._isAbsRight && comp._right !== 0) {
                comp._right /= 100;
            }
            if (!comp._isAbsTop && comp._top !== 0) {
                comp._top /= 100;
            }
            if (!comp._isAbsBottom && comp._bottom !== 0) {
                comp._bottom /= 100;
            }
            if (!comp._isAbsHorizontalCenter && comp._horizontalCenter !== 0) {
                comp._horizontalCenter /= 100;
            }
            if (!comp._isAbsVerticalCenter && comp._verticalCenter !== 0) {
                comp._verticalCenter /= 100;
            }
        }
    }
}

export async function migrateUIPriority(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp._priority !== undefined) {
            if (comp.__type__ === 'cc.UITransformComponent' || comp.__type__ === 'cc.CanvasComponent') {
                continue;
            }

            const node = json[comp.node.__id__];
            for (let i = 0; i < node._components.length; i++) {
                const element = node._components[i];
                const trans = json[element.__id__];
                if (trans.__type__ === 'cc.UITransformComponent') {
                    trans._priority = comp._priority;
                    delete comp._priority;
                }
            }
        }
    }
}

///////////////////////////////////////////////

/**
 * cc.SceneGlobals中的skybox加上getter setter后，序列的属性变为 _skybox
 * @param asset
 */
export async function migrateSkybox(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp.__type__ === 'cc.SceneGlobals') {
            if (comp.skybox) {
                comp._skybox = comp.skybox;
                delete comp.skybox;
            }
        }
    }
}

const skinningMaterials: Set<string> = new Set();
async function migrateSkinningMaterial(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (!comp._materials) {
            continue;
        }
        if (comp.__type__ === 'cc.SkinningModelComponent') {
            for (const matInfo of comp._materials) {
                const uuid = matInfo && matInfo.__uuid__;
                const material = uuid && queryAsset(uuid);
                if (!material || skinningMaterials.has(uuid)) {
                    continue;
                }
                asset._assetDB.taskManager.pause(asset.task);
                await material.waitInit();
                asset._assetDB.taskManager.resume(asset.task);
                if (existsSync(material.source)) {
                    skinningMaterials.add(uuid);
                    const mat = await readJSON(material.source);
                    const num = mat._defines.length || 1;
                    for (let i = 0; i < num; i++) {
                        let defines = mat._defines[i];
                        if (!defines) {
                            defines = mat._defines[0] = {};
                        }
                        if (!defines.USE_SKINNING) {
                            defines.USE_SKINNING = true;
                        }
                    }
                    writeJSONSync(material.source, mat, { spaces: 2 });
                } else if (uuid[uuid.length - 6] === '@') {
                    // material subasset, replace with its skinning counterpart
                    const name = material._name;
                    if (name.indexOf('-skinning') >= 0) {
                        continue;
                    } // already using skinning version
                    const subID = nameToId(name.slice(0, name.indexOf('.')) + '-skinning.material');
                    if (material.parent && material.parent.subAssets[subID]) {
                        matInfo.__uuid__ = uuid.slice(0, -6) + '@' + subID;
                    }
                }
            }
        }
    }
    for (const comp of json) {
        // warn about cross usage
        if (!comp._materials) {
            continue;
        }
        if (comp.__type__ !== 'cc.SkinningModelComponent') {
            for (const matInfo of comp._materials) {
                if (!matInfo) {
                    continue;
                }
                const uuid = matInfo.__uuid__;
                if (skinningMaterials.has(uuid)) {
                    const name = json[comp.node.__id__].name;
                    console.warn(`skinning material '${uuid}' used on non-skinning model component on node '${name}'`);
                }
            }
        }
    }
}

async function migrateBackSkinningMaterial(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (!comp._materials) {
            continue;
        }
        if (comp.__type__ === 'cc.SkinningModelComponent') {
            for (const matInfo of comp._materials) {
                const uuid = matInfo && matInfo.__uuid__;
                if (uuid[uuid.length - 6] === '@') {
                    // material subasset
                    const PID = uuid.slice(0, uuid.length - 6);
                    const parent = queryAsset(PID);
                    if (!parent) {
                        continue;
                    }
                    asset._assetDB.taskManager.pause(asset.task);
                    await parent.waitInit();
                    asset._assetDB.taskManager.resume(asset.task);
                    const CID = uuid.slice(uuid.length - 5);
                    for (const sub in parent.subAssets) {
                        const subAsset = parent.subAssets[sub];
                        const name = (subAsset && subAsset._name) || '';
                        if (nameToId(name.slice(0, name.indexOf('.')) + '-skinning.material') === CID) {
                            matInfo.__uuid__ = subAsset.uuid;
                            break;
                        }
                    }
                }
            }
        }
    }
}

async function migrateSkinningMaterialForMeshSplit(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp.__type__ === 'cc.SkinningModelComponent') {
            const materials = comp._materials;
            if (!comp._mesh) {
                continue;
            }
            const meshUUID = comp._mesh.__uuid__;
            // 这里不能直接查询 sub 资源
            // 因为如果需要使用的资源正在并行导入，正好处于销毁状态的时候
            // 查询不到对应的子资源，因为子资源会强制销毁再重新生成
            const parentUUID = meshUUID.split('@')[0];
            const parent = queryAsset(parentUUID);
            if (!parent) {
                continue;
            }
            asset._assetDB.taskManager.pause(asset.task);
            await parent.waitInit();
            asset._assetDB.taskManager.resume(asset.task);
            const sub = queryAsset(meshUUID);
            if (!sub) {
                continue;
            }
            const path = sub.library + '.json';
            if (existsSync(path)) {
                const struct = readJsonSync(path)._struct as cc.Mesh.IStruct;
                const primitives = struct.primitives.length;
                const matLen = materials.length;
                if (matLen < primitives) {
                    const converter = await glTfReaderManager.getOrCreate(sub.parent as Asset);
                    let oMesh = converter.processedMeshes.find((m) =>
                        struct.jointMaps?.every((mp, i) => mp.every((jt, j) => m.jointMaps && m.jointMaps[i][j] === jt)),
                    );
                    if (!oMesh) {
                        oMesh = converter.processedMeshes.find((m) =>
                            struct.vertexBundles.every((vb, i) => vb.view.count === m.geometries[i]?.vertexCount),
                        );
                    }
                    const oIndices =
                        (oMesh && oMesh.materialIndices) ||
                        Array(primitives)
                            .fill(0)
                            .map((_, i) => Math.min(i, matLen - 1));
                    const oMaterias = materials.slice();
                    for (let i = 0; i < primitives; i++) {
                        materials[i] = oMaterias[oIndices[i]];
                    }
                }
            }
        }
    }
}

/////////////////////////////////
const ParticleModule = [
    'cc.ColorOvertimeModule',
    'cc.SizeOvertimeModule',
    'cc.RotationOvertimeModule',
    'cc.ForceOvertimeModule',
    'cc.LimitVelocityOvertimeModule',
    'cc.VelocityOvertimeModule',
    'cc.ShapeModule',
];

export async function migrateParticleModule(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (ParticleModule.indexOf(comp.__type__) !== -1) {
            comp.enable !== undefined && (comp._enable = comp.enable);
        }
    }
}

const ParticleModuleName = [
    'colorOverLifetimeModule',
    'sizeOvertimeModule',
    'rotationOvertimeModule',
    'forceOvertimeModule',
    'limitVelocityOvertimeModule',
    'velocityOvertimeModule',
    'shapeModule',
    'trailModule',
    'textureAnimationModule',
];

export async function migrateParticleComponentModule(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp.__type__ === 'cc.ParticleSystemComponent') {
            ParticleModuleName.forEach((name) => {
                const newName = '_' + name;
                comp[newName] = comp[name];
                delete comp[name];
            });
        }
    }
}

export async function migrateScrollAndPageViewComponenetModule(asset: Asset, type: string) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const data of json) {
        if (data.__type__ === type && data._content) {
            const id = data._content.__id__;
            const target = json[id];
            // 防止重复升级报错
            if (!target._components) {
                continue;
            }
            let newID = null;
            for (let i = 0; i < target._components.length; ++i) {
                const compID = target._components[i].__id__;
                const comp = json[compID];
                if (comp.__type__ === 'cc.UITransformComponent') {
                    newID = compID;
                    break;
                }
            }
            data._content.__id__ = newID;
        }
    }
}

///////////////////////////////////////////////

/**
 * v1.1 开始，CapsuleColliderComponent 的 height 去除，取而代之的是 cylinderHeight。
 * @param asset
 */
async function migrateCapsuleColliderHeight(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    json.forEach((object: any) => {
        if (object.__type__ === 'cc.CapsuleColliderComponent') {
            const h = object._height;
            const r = object._radius;
            let ch = h - r * 2;
            if (ch < 0) {
                ch = 0;
            }
            object._cylinderHeight = ch;
            delete object._height;
        }
    });
}

// v1.2 版本合并 planarShadow 和 shadowMap 为 shadows
export async function migrateShadow(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp.__type__ === 'cc.SceneGlobals') {
            if (comp.planarShadows) {
                comp.shadows = comp.planarShadows;
                delete comp.planarShadows;
            }
        } else if (comp.__type__ === 'cc.PlanarShadowInfo') {
            comp.__type__ = 'cc.ShadowsInfo';
        }
    }
}

export const _renameMap: any = {
    'cc.ModelComponent': 'cc.MeshRenderer',
    'cc.SkinningModelComponent': 'cc.SkinnedMeshRenderer',
    'cc.BatchedSkinningModelComponent': 'cc.SkinnedMeshBatchRenderer',
    'cc.CameraComponent': 'cc.Camera',
    'cc.AudioSourceComponent': 'cc.AudioSource',
    'cc.DirectionalLightComponent': 'cc.DirectionalLight',
    'cc.SphereLightComponent': 'cc.SphereLight',
    'cc.SpotLightComponent': 'cc.SpotLight',
    'cc.LightComponent': 'cc.Light',
    'cc.AnimationComponent': 'cc.Animation',
    'cc.SkeletalAnimationComponent': 'cc.SkeletalAnimation',
    'cc.ParticleSystemComponent': 'cc.ParticleSystem',
    'cc.BillboardComponent': 'cc.Billboard',
    'cc.LineComponent': 'cc.Line',
    'cc.RigidBodyComponent': 'cc.RigidBody',
    'cc.BoxColliderComponent': 'cc.BoxCollider',
    'cc.SphereColliderComponent': 'cc.SphereCollider',
    'cc.CapsuleColliderComponent': 'cc.CapsuleCollider',
    'cc.CylinderColliderComponent': 'cc.CylinderCollider',
    'cc.ConeColliderComponent': 'cc.ConeCollider',
    'cc.PlaneColliderComponent': 'cc.PlaneCollider',
    'cc.SimplexColliderComponent': 'cc.SimplexCollider',
    'cc.TerrainColliderComponent': 'cc.TerrainCollider',
    'cc.MeshColliderComponent': 'cc.MeshCollider',
    'cc.HingeConstraintComponent': 'cc.HingeConstraint',
    'cc.PointToPointConstraintComponent': 'cc.PointToPointConstraint',

    'cc.UITransformComponent': 'cc.UITransform',
    'cc.UIModelComponent': 'cc.UIMeshRenderer',
    'cc.CanvasComponent': 'cc.Canvas',
    'cc.SpriteComponent': 'cc.Sprite',
    'cc.LabelComponent': 'cc.Label',
    'cc.GraphicsComponent': 'cc.Graphics',
    'cc.WidgetComponent': 'cc.Widget',
    'cc.ButtonComponent': 'cc.Button',
    'cc.MaskComponent': 'cc.Mask',
    'cc.ScrollViewComponent': 'cc.ScrollView',
    'cc.ScrollBarComponent': 'cc.ScrollBar',
    'cc.PageViewComponent': 'cc.PageView',
    'cc.PageViewIndicatorComponent': 'cc.PageViewIndicator',
    'cc.SliderComponent': 'cc.Slider',
    'cc.ToggleContainerComponent': 'cc.ToggleContainer',
    'cc.ToggleComponent': 'cc.Toggle',
    'cc.RichTextComponent': 'cc.RichText',
    'cc.LayoutComponent': 'cc.Layout',
    'cc.UIStaticBatchComponent': 'cc.UIStaticBatch',
    'cc.UIOpacityComponent': 'cc.UIOpacity',
    'cc.LabelOutlineComponent': 'cc.LabelOutline',
    'cc.ProgressBarComponent': 'cc.ProgressBar',
    'cc.EditBoxComponent': 'cc.EditBox',
    'cc.BlockInputEventsComponent': 'cc.BlockInputEvents',
    'cc.UICoordinateTrackerComponent': 'cc.UICoordinateTracker',
    'cc.SafeAreaComponent': 'cc.SafeArea',
    'cc.ViewGroupComponent': 'cc.ViewGroup',
    'cc.RenderComponent': 'cc.UIRenderable',
};

async function migrateComponentNames(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (let i = 0; i < json.length; i++) {
        const comp = json[i];
        let name = comp.__type__;
        let newName = _renameMap[name];
        if (newName) {
            comp.__type__ = newName;
            name = name.substring(3);
            newName = newName.substring(3);
            comp._name = comp._name.replace(name, newName);
        }
    }
}

async function migrateClickEventsNames(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (let i = 0; i < json.length; i++) {
        const obj = json[i];
        if (obj.__type__ !== 'cc.ClickEvent') {
            continue;
        }
        const name = obj._componentId;
        const newName = _renameMap[name];
        if (newName) {
            obj._componentId = newName;
        }
    }
}
const widgetRE = /^cc.Widget$/i;
async function migrateCanvasAddWidget(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    try {
        for (const element of json) {
            if (element.__type__ === 'cc.Canvas') {
                if (!getComponent(json, element.node.__id__, widgetRE)) {
                    const WidgetComponent = JSON.parse(JSON.stringify(Widget));
                    WidgetComponent.node.__id__ = element.node.__id__;
                    // 45 Flag 表示 widget 全屏适应
                    WidgetComponent._alignFlags = 45;
                    json.push(WidgetComponent);
                    const node = json[element.node.__id__];
                    if (node) {
                        node._components.push({
                            __id__: json.length - 1,
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// layer 接口
interface LayerItem {
    name: string;
    value: number;
}

// 用户独占列表
const _maskMap: Map<number, string> = new Map();

// 计数器
let _times = 0;

// Canvas split 2DCamera,去除 Canvas 上关于 cameraComponent 上的五个重复属性，
// 同时为其添加 cameraComponent 组件，并使用。
async function migrateCanvasCamera(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    let userLayers: LayerItem[] = await profile.getProject('project', 'layer') ?? [];

    // 在第一次数据迁移时，获取用户独占 layer 的列表。
    // 避免被后续插入的 canvas layer 影响。
    if (_times === 0) {
        _times++;
        const target = join(GlobalPaths.staticDir, 'assets/migrate-scene-canvas.ts');
        const dist = join(assetConfig.data.root, './assets/migrate-canvas.ts');
        await copyFile(target, dist);
        assetDBManager.assetDBMap.assets.refresh(dist);
        for (const layer of userLayers) {
            _maskMap.set(layer.value, layer.name);
        }
    }

    // 从 json 文件中读出关键信息
    try {
        // 筛选出场景内原来的 camera
        for (const object of json) {
            //  需要在修改场景数据前，将 camera 升级完
            if (object.__type__ === 'cc.Camera') {
                // 更好的方式是记录一个所有 layer 的数值，全部二进制运算，这里循环 20 次是因为不想重新弄一个数据
                for (let i = 20; i > 0; i--) {
                    const layer = 1 << i;
                    if (!_maskMap.has(layer) && object._visibility & layer) {
                        object._visibility ^= layer;
                    }
                }
            }
        }

        let canvasNum = 0;
        let group = '';
        let layerMask = 0;
        // 迁移 canvas 数据
        for (const object of json) {
            // 取所有canvas
            if (object.__type__ === 'cc.Canvas') {
                canvasNum++;

                // layer 层级在当前场景是否够还够分配
                const isEnough: boolean = 20 - canvasNum >= _maskMap.size;
                if (!isEnough) {
                    console.warn(`layer is not enough! Please check the scene! [${asset.url}]`);
                }

                // 获取未使用的自定义 layer
                const canvasNode = json[object.node.__id__];
                for (let i = 20 - canvasNum; i >= 0; i--) {
                    // layer 层级够分配，且用户独占，则跳过该 mask
                    // layer 层级不够分配，或者没有使用到用户独占 mask，则添加
                    if (_maskMap.has(1 << i) && isEnough) {
                        continue;
                    }

                    layerMask = 1 << i;
                    group = `canvas_${i}`;
                    canvasNode._layer = layerMask;

                    // 将未使用的 canvas layer插入到指定位置
                    const layer = userLayers.find((layer: any) => layer.value === layerMask);
                    if (!layer) {
                        userLayers.push({ name: group, value: layerMask });
                        // @ts-ignore
                        userLayers.sort((a, b) => {
                            return a.value - b.value;
                        });
                        await profile.setProject('project', 'layer', userLayers);
                    }

                    break;
                }

                if (object.node) {
                    // 将 canvas 下的所有的节点 layer 加入到 _visibility 中。
                    preChildSet(json, object.node, layerMask);

                    const nodeID = json.length;

                    // 创建 camera 节点
                    const jsonNodeObj = JSON.parse(getNodeStr());
                    jsonNodeObj[0]._name = `UICamera_${json[object.node.__id__]._name}`;
                    jsonNodeObj[0]._parent = object.node;
                    jsonNodeObj[0]._layer = layerMask;
                    jsonNodeObj[0]._id = utils.UUID.generate();
                    const objNode = json[object.node.__id__];
                    objNode._children.push({
                        __id__: nodeID,
                    });

                    const inPrefab = json[0] && json[0].__type__ === 'cc.Prefab';
                    if (inPrefab) {
                        jsonNodeObj[0]._prefab = {};
                        jsonNodeObj[0]._prefab.__id__ = nodeID + 1;
                    }
                    if (inPrefab) {
                        jsonNodeObj[0]._components[0].__id__ = nodeID + 2;
                    } else {
                        jsonNodeObj[0]._components[0].__id__ = nodeID + 1;
                    }

                    // 创建 cameraNode.PrefabInfo
                    let nodePrefabInfoObj: any | null = null;
                    if (inPrefab) {
                        const jsonPrefabInfoObj = JSON.parse(getPrefabInfoStr());
                        nodePrefabInfoObj = jsonPrefabInfoObj[0];
                        nodePrefabInfoObj.root.__id__ = nodeID;
                        nodePrefabInfoObj.asset.__id__ = 0;
                        nodePrefabInfoObj.fileId = utils.UUID.generate();
                    }

                    // 创建 cameraComponent 组件
                    const jsonCameraObj = JSON.parse(getCameraStr());
                    jsonCameraObj[0].node.__id__ = nodeID;
                    jsonCameraObj[0]._priority = getViewPriority(object, object._priority);
                    jsonCameraObj[0]._targetTexture = object._targetTexture;
                    jsonCameraObj[0]._clearFlags = object._clearFlag !== undefined ? object._clearFlag : 6;
                    jsonCameraObj[0]._color =
                        object._color !== undefined
                            ? JSON.parse(JSON.stringify(object._color))
                            : {
                                __type__: 'cc.Color',
                                r: 0,
                                g: 0,
                                b: 0,
                                a: 255,
                            };

                    jsonCameraObj[0]._visibility = 1 << 23; // UI_3D
                    jsonCameraObj[0]._visibility |= 1 << 25; // UI_2D
                    jsonCameraObj[0]._visibility |= layerMask; // canvas 下所有子节点
                    // Camera.ProjectionType.ORTHO
                    jsonCameraObj[0]._projection = 0;
                    jsonCameraObj[0]._far = 2000;
                    jsonCameraObj[0]._rect = {
                        __type__: 'cc.Rect',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    };
                    if (inPrefab) {
                        jsonCameraObj[0].__prefab = {};
                        jsonCameraObj[0].__prefab.__id__ = nodeID + 3;
                    }

                    // jsonCameraObj._flow = ['UIFlow'];
                    jsonCameraObj[0]._id = utils.UUID.generate();

                    // 创建 cameraComponent.CompPrefabInfo
                    let compPrefabInfoObj: any | null = null;
                    if (inPrefab) {
                        const jsonCompPrefabInfoObj = JSON.parse(getCompPrefabInfoStr());
                        compPrefabInfoObj = jsonCompPrefabInfoObj[0];
                        compPrefabInfoObj.fileId = utils.UUID.generate();
                    }

                    object._cameraComponent = {};
                    if (inPrefab) {
                        object._cameraComponent.__id__ = nodeID + 2;
                    } else {
                        object._cameraComponent.__id__ = nodeID + 1;
                    }

                    //                                                  isPrefabInfo    |   noPrefabInfo
                    object._alignCanvasWithScreen = true;
                    json.push(jsonNodeObj[0]); // NodeID + 0   |   NodeID + 0
                    if (inPrefab) {
                        json.push(nodePrefabInfoObj);
                    } // NodeID + 1   |
                    json.push(jsonCameraObj[0]); // NodeID + 2   |   NodeID + 1
                    if (inPrefab) {
                        json.push(compPrefabInfoObj);
                    } // NodeID + 3   |

                    // 只需要处理场景，如果父节点是 prefab，摄像机也是 prefab
                    if (!inPrefab && canvasNode && canvasNode._prefab) {
                        const cameraPrefabInfo = JSON.parse(getSinglePrefabInfoStr());
                        const canvasPrefabInfo = json[canvasNode._prefab.__id__];
                        if (canvasPrefabInfo) {
                            cameraPrefabInfo.root.__id__ = canvasPrefabInfo.root.__id__;
                            cameraPrefabInfo.asset = {
                                __uuid__: canvasPrefabInfo.asset.__uuid__,
                            };
                            cameraPrefabInfo.fileId = utils.UUID.generate();
                        }
                        json.push(cameraPrefabInfo);
                        const cameraPrefabID = json.length - 1;
                        jsonNodeObj[0]._prefab = {
                            __id__: cameraPrefabID,
                        };
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// 将 canvas 下的所有的节点 layer 加入到 camera.visibility 中。
function preChildSet(json: any[], node: any, layer: number) {
    for (const value of json[node.__id__]._children) {
        json[value.__id__]._layer = layer;
        preChildSet(json, value, layer);
    }
}

function getViewPriority(canvas: any, priority: number) {
    const renderMode = canvas._renderMode;
    return renderMode === 0 || renderMode === undefined ? priority | (1 << 30) : priority;
}

function getNodeStr() {
    return '[{"__type__": "cc.Node","_name": "Camera","_objFlags": 0,"_parent": {  "__id__": 1},"_children": [],"_active": true,"_components": [  {    "__id__": 10  }],"_prefab": null,"_lpos": {  "__type__": "cc.Vec3",  "x": 0,  "y": 0,  "z": 0},"_lrot": {  "__type__": "cc.Quat",  "x": 0,  "y": 0,  "z": 0,  "w": 1},"_lscale": {  "__type__": "cc.Vec3",  "x": 1,  "y": 1,  "z": 1},"_layer": 1073741824,"_euler": {  "__type__": "cc.Vec3",  "x": 0,  "y": 0,  "z": 0},"_id": "c9DMICJLFO5IeO07EPon7U"}]';
}

function getCameraStr() {
    return '[{"__type__": "cc.Camera","_name": "","_objFlags": 0,"node": {  "__id__": 0},"_enabled": true,"__prefab": null,"_projection": 1,"_priority": 0,"_fov": 45,"_fovAxis": 0,"_orthoHeight": 10,"_near": 1,"_far": 1000,"_color": {  "__type__": "cc.Color",  "r": 51,  "g": 51,  "b": 51,  "a": 255},"_depth": 1,"_stencil": 0,"_clearFlags": 7,"_rect": {  "__type__": "cc.Rect",  "x": 0,  "y": 0,  "width": 1,  "height": 1},"_aperture": 19,"_shutter": 7,"_iso": 0,"_screenScale": 1,"_visibility": 1822425087,"_targetTexture": null,"_id": "7dWQTpwS5LrIHnc1zAPUtf"}]';
}

function getPrefabInfoStr() {
    return '[{"__type__": "cc.PrefabInfo","root": {"__id__": 1 },"asset": {"__id__": 0 },"fileId": "deuJTKRANDsKzJ5LeyO/KM"}]';
}

function getSinglePrefabInfoStr() {
    return '{"__type__": "cc.PrefabInfo","root": {"__id__": 1 },"asset": {"__uuid__": 0 },"fileId": ""}';
}

function getCompPrefabInfoStr() {
    return '[{"__type__": "cc.CompPrefabInfo","fileId": "3cUBXFJqdHqabkl+K4SlQ6"}]';
}

// v3.0 刚体属性调整，去除 isKinematic\fixedRotation，增加 type
async function migrateRigidBody(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    json.forEach((object: any) => {
        if (object.__type__ === 'cc.RigidBody') {
            if (object._mass == 0) {
                object._type = 2;
            } else if (object._isKinematic) {
                object._type = 4;
            }

            if (object._fixedRotation) {
                object._angularFactor.x = 0;
                object._angularFactor.y = 0;
                object._angularFactor.z = 0;
            }
        }
    });
}

async function migrateUICustomMaterial(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (let i = 0; i < json.length; i++) {
        const obj = json[i];
        if (
            obj.__type__ === 'cc.Sprite' ||
            obj.__type__ === 'cc.Label' ||
            obj.__type__ === 'cc.Graphics' ||
            obj.__type__ === 'cc.Mask' ||
            obj.__type__ === 'cc.UIStaticBatch'
        ) {
            if (obj._materials && obj._materials.length) {
                obj._customMaterial = obj._materials[0];
            }
            delete obj._materials;
        }
    }
}

async function migrateVisibilityTypeError(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (let i = 0; i < json.length; i++) {
        const obj = json[i];
        if (obj.__type__ === 'cc.Camera') {
            obj._visibility = obj._visibility - 0;
        }
    }
}

export async function migrateUILayout(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const comp of json) {
        if (comp.__type__ === 'cc.Layout') {
            if (comp['_N$layoutType'] !== undefined) {
                comp._layoutType = comp._N$layoutType;
                delete comp._N$layoutType;
            }

            if (comp['_N$padding'] !== undefined) {
                comp._paddingLeft = comp._paddingRight = comp._paddingTop = comp._paddingBottom = comp._N$padding;
                delete comp._N$padding;
            }
        }
    }
}

export async function migratePrefabCompPrefabInfo(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    const inPrefab = json[0] && json[0].__type__ === 'cc.Prefab';
    for (const item of json) {
        if (item.__type__ === 'cc.CompPrefabInfo ') {
            item.__type__ = 'cc.CompPrefabInfo';
        } else if (inPrefab && item.__type__ === 'cc.PrefabInfo' && item.root.__id__ === 1) {
            if (item.asset === null || item.asset.__uuid__ === asset.uuid) {
                // 如果自身的 PrefabInfo 的 asset 为 null 就设置为 0，表示自身
                item.asset = {
                    __id__: 0,
                };
            }
        }
    }
}

async function migrateGeometryCurveCurveRange330(asset: Asset) {
    const swap = asset.getSwapSpace<MigrationSwapSpace>();
    const archive = new Archive(swap.json);
    await migrateGeometryCurve330(archive);
    await migrateCurveRange330(archive);
    const archiveResult = archive.get();
    swap.json = archiveResult;
}

export async function migrateShadowInfo(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    let min = 1 << 12;
    let mi = 8;
    for (const item of json) {
        if (item.__type__ === 'cc.ShadowsInfo') {
            if (item._shadowColor) {
                item._saturation = (item._shadowColor as cc.Color).a / 255.0;
            }

            if (item._size) {
                const size = item._size as cc.Vec2;
                const numb = cc.math.absMax(size.x, size.y);
                for (let i = 8; i < 12; i++) {
                    const tmp = cc.math.bits.abs((1 << i) - numb);
                    if (tmp < min) {
                        min = tmp;
                        mi = i;
                    }
                }

                item._size = {
                    __type__: 'cc.Vec2',
                    x: 1 << mi,
                    y: 1 << mi,
                };
            }
        }
    }
}

export async function migrateShadowDepthBias(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    const multiplier = 10000.0;

    for (const item of json) {
        if (item.__type__ === 'cc.ShadowsInfo') {
            if (item._bias) {
                item._bias = utils.Math.clamp(item._bias * multiplier, 0.01, 1.0);
            }
        }
    }
}

export async function migratePrivateNode(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    const privateNodeFlag: number = cc.CCObject.Flags.DontSave | cc.CCObject.Flags.HideInHierarchy;

    for (const item of json) {
        if (item.__type__ === 'cc.PrivateNode') {
            item.__type__ = 'cc.Node';
            item._objFlags |= privateNodeFlag;
        }
    }
}

export async function migrateShadowAutoAdapt(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const item of json) {
        if (item.__type__ === 'cc.ShadowsInfo') {
            // 删掉旧数据
            if ('_packing' in item) {
                delete item._packing;
            }
            if ('_linear' in item) {
                delete item._linear;
            }
            if ('_selfShadow' in item) {
                delete item._selfShadow;
            }
            if ('_aspect' in item) {
                delete item._aspect;
            }

            const existsDistance = '_shadowDistance' in item;
            const existsAutoAdapt = '_autoAdapt' in item;

            // 判断 cc.ShadowsInfo._shadowDistance 序列化的属性是否存在
            // 避免用户设置好数据后，重复去设置 _shadowDistance
            if (existsDistance) {
                item._firstSetCSM = false;
                if (existsAutoAdapt) {
                    // 旧场景数据升级后，删除 _autoAdapt 属性
                    delete item._autoAdapt;
                }
            } else {
                // 判断 cc.ShadowsInfo._autoAdapt 序列化的属性是否存在
                if (existsAutoAdapt) {
                    // 旧项目存在 _autoAdapt 属性时,对其结果进行升级
                    if (item._autoAdapt === true) {
                        item._fixedArea = false;
                        item._firstSetCSM = true;
                    } else {
                        item._fixedArea = true;
                    }

                    // 旧场景数据升级后，删除 _autoAdapt 属性
                    delete item._autoAdapt;
                }
            }
        }
    }
}
export async function migrateHDRData(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    const standardCameraParamsExposure = 1 / 38400.0;

    for (const item of json) {
        if (item.__type__ === 'cc.SkyboxInfo') {
            const hasHDR = '_useHDR' in item;
            const hasEnvmapLDR = '_envmapLDR' in item;
            const hasDiffuseMapLDR = '_diffuseMapLDR' in item;
            const hasDiffuseMapHDR = '_diffuseMapHDR' in item;
            const hasApplyDiffuseMap = '_applyDiffuseMap' in item;
            const hasIsRGBE = '_isRGBE' in item;

            if (!hasHDR) {
                item._useHDR = true;
            }

            if (!hasEnvmapLDR) {
                item._envmapLDR = item._envmap;
                item._envmapHDR = item._envmap;
            }

            if (!hasDiffuseMapLDR) {
                item._diffuseMapLDR = null;
            }

            if (!hasDiffuseMapHDR) {
                item._diffuseMapHDR = null;
            }

            if (hasIsRGBE) {
                delete item._isRGBE;
            }

            if (!hasApplyDiffuseMap) {
                item._applyDiffuseMap = false;
            }
        }

        if (item.__type__ === 'cc.AmbientInfo') {
            const skyColor = new cc.Color(item._skyColor);
            const groundAlbedo = new cc.Color(item._groundAlbedo);

            const hasSkyColor = '_skyColorLDR' in item;
            const hasAlbedoColor = '_groundAlbedoLDR' in item;
            const hasSkyIllumLDR = '_skyIllumLDR' in item;
            const hasSkyIllumHDR = '_skyIllumHDR' in item;

            if (!hasSkyColor) {
                item._skyColor = {
                    __type__: 'cc.Vec4',
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 0,
                };
                item._skyColor.x = skyColor.x;
                item._skyColor.y = skyColor.y;
                item._skyColor.z = skyColor.z;
                item._skyColor.w = 0.520833125;
                item._skyColorLDR = item._skyColor;
                item._skyColorHDR = item._skyColor;
            }

            if (!hasAlbedoColor) {
                item._groundAlbedo = {
                    __type__: 'cc.Vec4',
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 0,
                };
                item._groundAlbedo.x = groundAlbedo.x;
                item._groundAlbedo.y = groundAlbedo.y;
                item._groundAlbedo.z = groundAlbedo.z;
                item._groundAlbedo.w = groundAlbedo.w;
                item._groundAlbedoLDR = item._groundAlbedo;
                item._groundAlbedoHDR = item._groundAlbedo;
            }

            if (!hasSkyIllumLDR) {
                item._skyIllumLDR = item._skyIllum * standardCameraParamsExposure * 1.5;
            }
            if (!hasSkyIllumHDR) {
                item._skyIllumHDR = item._skyIllum;
            }
        }

        if (item.__type__ === 'cc.DirectionalLight') {
            const hasIlluminanceLDR = '_illuminanceLDR' in item;
            const hasIlluminanceHDR = '_illuminanceHDR' in item;

            if (!hasIlluminanceLDR) {
                item._illuminanceLDR = item._illuminance * standardCameraParamsExposure;
            }
            if (!hasIlluminanceHDR) {
                item._illuminanceHDR = item._illuminance;
            }
        }

        if (item.__type__ === 'cc.SpotLight' || item.__type__ === 'cc.SphereLight') {
            const hasLuminanceLDR = '_luminanceLDR' in item;
            const hasLuminanceHDR = '_luminanceHDR' in item;

            if (!hasLuminanceLDR) {
                const lightMeterScale = 10000.0;
                item._luminanceLDR = item._luminance * standardCameraParamsExposure * lightMeterScale;
            }
            if (!hasLuminanceHDR) {
                item._luminanceHDR = item._luminance;
            }
        }
    }
}
export async function migrateFogData(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const item of json) {
        if (item.__type__ === 'cc.FogInfo') {
            const hasColor = '_fogColor' in item;
            const hasAccurate = '_accurate' in item;
            if (hasColor) {
                item._fogColor.r = Math.floor(Math.sqrt(item._fogColor.r / 255.0) * 255);
                item._fogColor.g = Math.floor(Math.sqrt(item._fogColor.g / 255.0) * 255);
                item._fogColor.b = Math.floor(Math.sqrt(item._fogColor.b / 255.0) * 255);
            }
            if (!hasAccurate) {
                item._accurate = false;
            }
        }
    }
}
export async function migrateSkyLightingTypeData(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const item of json) {
        if (item.__type__ === 'cc.SkyboxInfo') {
            let useIBL = false;
            let useDiffusemap = false;

            const hasIBL = '_useIBL' in item;
            const hasApplyDiffuseMap = '_applyDiffuseMap' in item;
            if (hasIBL) {
                useIBL = item._useIBL;
                delete item._useIBL;
            }
            if (hasApplyDiffuseMap) {
                useDiffusemap = item._applyDiffuseMap;
                delete item._applyDiffuseMap;
            }
            if (useIBL) {
                item._envLightingType = 1;
                if (useDiffusemap) {
                    item._envLightingType = 2;
                }
            } else {
                item._envLightingType = 0;
            }
        }
    }
}

export async function migrateLightBakeable(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const item of json) {
        if (item.__type__ === 'cc.StaticLightSettings') {
            const bakeable = item._bakeable;
            if (bakeable) {
                delete item._bakeable;
            }
        }
    }
}

// Shadow info 接口
interface ShadowInfo {
    // public
    enabled: boolean;

    // shadow map
    pcf: number;
    bias: number;
    normalBias: number;
    saturation: number;
    invisibleOcclusionRange: number;
    shadowDistance: number;

    // fix area directional
    fixedArea: boolean;
    near: number;
    far: number;
    orthoSize: number;
}

export async function migrateShadowsData(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    // 缓存 shadowsInfo 中的阴影信息
    let shadowInfo = <ShadowInfo>{};
    for (const item of json) {
        if (item.__type__ === 'cc.ShadowsInfo') {
            shadowInfo = {
                enabled: item._enabled === undefined ? false : item._enabled,

                // shadow map
                pcf: item._pcf === undefined ? 0 : item._pcf,
                bias: item._bias === undefined ? 0.0 : item._bias,
                normalBias: item._normalBias === undefined ? 0.0 : item._normalBias,
                saturation: item._saturation === undefined ? 1.0 : item._saturation,
                shadowDistance: item._shadowDistance === undefined ? 100 : item._shadowDistance,
                invisibleOcclusionRange: item._invisibleOcclusionRange === undefined ? 200 : item._invisibleOcclusionRange,

                // fixed area
                fixedArea: item._fixedArea === undefined ? false : item._fixedArea,
                near: item._near === undefined ? 0.1 : item._near,
                far: item._far === undefined ? 10.0 : item._far,
                orthoSize: item._orthoSize === undefined ? 5 : item._orthoSize,
            };

            if ('_firstSetCSM' in item) {
                delete item._firstSetCSM;
            }

            if ('_fixedArea' in item) {
                delete item._fixedArea;
            }

            if ('_pcf' in item) {
                delete item._pcf;
            }

            if ('_bias' in item) {
                delete item._bias;
            }

            if ('_normalBias' in item) {
                delete item._normalBias;
            }

            if ('_near' in item) {
                delete item._near;
            }

            if ('_far' in item) {
                delete item._far;
            }

            if ('_shadowDistance' in item) {
                delete item._shadowDistance;
            }

            if ('_invisibleOcclusionRange' in item) {
                delete item._invisibleOcclusionRange;
            }

            if ('_orthoSize' in item) {
                delete item._orthoSize;
            }

            if ('_saturation' in item) {
                delete item._saturation;
            }

            if ('_aspect' in item) {
                delete item._aspect;
            }
            break;
        }
    }

    for (const item of json) {
        // 将 shadowsInfo 中的数据，插入到方向光组件中并序列化
        if (item.__type__ === 'cc.DirectionalLight') {
            item._shadowEnabled = shadowInfo.enabled;

            // shadow map
            item._shadowPcf = shadowInfo.pcf;
            item._shadowBias = shadowInfo.bias;
            item._shadowNormalBias = shadowInfo.normalBias;
            item._shadowSaturation = shadowInfo.saturation;
            item._shadowDistance = shadowInfo.shadowDistance;
            item._shadowInvisibleOcclusionRange = shadowInfo.invisibleOcclusionRange;

            // fixed area
            item._shadowFixedArea = shadowInfo.fixedArea;
            item._shadowNear = shadowInfo.near;
            item._shadowFar = shadowInfo.far;
            item._shadowOrthoSize = shadowInfo.orthoSize;
        }

        // 将 shadowsInfo 中的数据，插入到聚光灯组件中并序列化
        if (item.__type__ === 'cc.SpotLight') {
            item._shadowEnabled = shadowInfo.enabled;

            item._shadowPcf = shadowInfo.pcf;
            item._shadowBias = shadowInfo.bias;
            item._shadowNormalBias = shadowInfo.normalBias;
        }
    }
}

export async function migratePunctualLightLuminance(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    const standardCameraParamsExposure = 1 / 38400.0;

    for (const item of json) {
        if (item.__type__ === 'cc.SpotLight' || item.__type__ === 'cc.SphereLight') {
            const hasLuminance = '_luminance' in item;
            const hasLuminanceLDR = '_luminanceLDR' in item;
            const hasLuminanceHDR = '_luminanceHDR' in item;

            if (hasLuminance) {
                item._luminance *= 3.14159;
            }
            if (hasLuminanceLDR) {
                item._luminanceLDR *= 3.14159;
            }
            if (hasLuminanceHDR) {
                item._luminanceHDR *= 3.14159;
            }
        }
    }
}

export async function migrateCSMData(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const item of json) {
        if (item.__type__ === 'cc.DirectionalLight') {
            if ('_shadowFixedArea' in item) {
                if (item._shadowFixedArea) {
                    item._csmLevel = item._csmLevel === undefined ? 4 : item._csmLevel;
                    item._csmLayerLambda = item._csmLayerLambda === undefined ? 0.75 : item._csmLayerLambda;
                    item._csmOptimizationMode = item._csmOptimizationMode === undefined ? 2 : item._csmOptimizationMode;
                } else {
                    item._csmLevel = item._csmLevel === undefined ? 1 : item._csmLevel;
                    item._csmLayerLambda = item._csmLayerLambda === undefined ? 0.75 : item._csmLayerLambda;
                    item._csmOptimizationMode = item._csmOptimizationMode === undefined ? 2 : item._csmOptimizationMode;
                }
            } else {
                item._shadowFixedArea = false;
                item._csmLevel = item._csmLevel === undefined ? 4 : item._csmLevel;
                item._csmLayerLambda = item._csmLayerLambda === undefined ? 0.75 : item._csmLayerLambda;
                item._csmOptimizationMode = item._csmOptimizationMode === undefined ? 2 : item._csmOptimizationMode;
            }
            break;
        }
    }
}

const spriteJson = `{
    "__type__": "cc.Sprite",
    "_name": "",
    "_objFlags": 0,
    "node": null,
    "_enabled": true,
    "__prefab": null,
    "_customMaterial": null,
    "_srcBlendFactor": 2,
    "_dstBlendFactor": 4,
    "_color": {
      "__type__": "cc.Color",
      "r": 255,
      "g": 255,
      "b": 255,
      "a": 255
    },
    "_spriteFrame": null,
    "_type": 0,
    "_fillType": 0,
    "_sizeMode": 1,
    "_fillCenter": {
      "__type__": "cc.Vec2",
      "x": 0,
      "y": 0
    },
    "_fillStart": 0,
    "_fillRange": 0,
    "_isTrimmedMode": true,
    "_useGrayscale": false,
    "_atlas": null,
    "_id": "a5Zd2oPN1CmbHXHJsmc75Z"
}`;

export async function migrateMaskImageStencil(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const obj of json) {
        if (obj.__type__ === 'cc.Mask') {
            const mask = obj;
            if (obj._type === 3 && mask._spriteFrame !== null) {
                const node = json[mask.node.__id__];
                const sprite = JSON.parse(spriteJson);
                sprite.node = mask.node;
                sprite._spriteFrame = mask._spriteFrame;
                sprite._enabled = mask._enabled;
                const id = json.length;
                json.push(sprite);
                node._components.push({ __id__: id });
                sprite._spriteFrame = mask._spriteFrame;
                sprite._id = utils.UUID.generate();
                // 在 prefab 中
                if (node._prefab) {
                    const compPrefabInfoObj = JSON.parse(getCompPrefabInfoStr())[0];
                    compPrefabInfoObj.fileId = utils.UUID.generate();
                    sprite._prefab = { __id__: json.length };
                    json.push(compPrefabInfoObj);
                }
            }
            delete mask._spriteFrame;
        }
    }
}

export async function migrateMaskImageStencilSizeMode(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const obj of json) {
        if (obj.__type__ === 'cc.Mask') {
            const mask = obj;
            for (const sp of json) {
                if (sp.__type__ === 'cc.Sprite' && sp.node?.__id__ === mask.node?.__id__) {
                    sp._sizeMode = 0;
                    sp._color = {
                        __type__: 'cc.Color',
                        r: 255,
                        g: 255,
                        b: 255,
                        a: 255,
                    };
                }
            }
        }
    }
}

export async function migrateLabelOutlineAndShadow(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const obj of json) {
        if (obj.__type__ === 'cc.Label') {
            const label = obj;
            for (const subObj of json) {
                if (!(subObj?.node && label?.node && subObj.node.__id__ === label.node.__id__)) {
                    continue;
                }

                if (subObj.__type__ === 'cc.LabelOutline') {
                    label._enableOutline = subObj._enabled;
                    label._outlineWidth = subObj._width;
                    label._outlineColor =
                        subObj._color !== undefined
                            ? JSON.parse(JSON.stringify(subObj._color))
                            : {
                                __type__: 'cc.Color',
                                r: 0,
                                g: 0,
                                b: 0,
                                a: 255,
                            };
                    delete subObj._width;
                    delete subObj._color;
                } else if (subObj.__type__ === 'cc.LabelShadow') {
                    label._enableShadow = subObj._enabled;
                    label._shadowBlur = subObj._blur;
                    label._shadowOffset =
                        subObj._offset !== undefined
                            ? JSON.parse(JSON.stringify(subObj._offset))
                            : {
                                __type__: 'cc.Vec2',
                                x: 2,
                                y: 2,
                            };
                    label._shadowColor =
                        subObj._color !== undefined
                            ? JSON.parse(JSON.stringify(subObj._color))
                            : {
                                __type__: 'cc.Color',
                                r: 0,
                                g: 0,
                                b: 0,
                                a: 255,
                            };
                    delete subObj._blur;
                    delete subObj._offset;
                    delete subObj._color;
                }
            }
        }
    }
}

// export async function migratePrefabInstanceIds(asset: Asset):Promise<boolean> {
//     if (asset.extname !== '.scene') return true;
//     const swap: any = asset.getSwapSpace();
//     const json: any[] = swap.json || await readJSON(asset.source);

//     const sceneRef = json[0]?.scene;
//     if (!sceneRef.__id__) return false;

//     const scene = json[sceneRef.__id__];
//     if (!scene?._prefab?.__id__ || !json[scene._prefab.__id__]) return true;

//     const instanceIds = json[scene._prefab.__id__].nestedPrefabInstanceRoots;
//     if (!instanceIds || instanceIds.length <= 0) return true;

//     for (let index = 0; index < instanceIds.length; index++) {
//         const data = instanceIds[index];
//         const node = json[data.__id__];

//         if (!node || node['__editorExtras__']?.mountedRoot) continue;

//         const prefab = getPrefabOfNode(data.__id__,json);

//         if (prefab?.instance?.__id__ && json[prefab.instance.__id__]) {
//             const instance = json[prefab.instance.__id__];
//             const ids: string[] = [];
//             instance.ids = ids;
//             await walkPrefabInstances(node, json, asset, (child: any) => {
//                 ids.push(utils.UUID.generate());
//             });
//         }
//     }

//     return true;
// }

export async function migrateBakeSettings(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const item of json) {
        if (item.__type__ === 'cc.MeshRenderer') {
            if (item.lightmapSettings) {
                item.bakeSettings = item.lightmapSettings;
                item.lightmapSettings = null;
            }
        }

        if (item.__type__ === 'cc.ModelLightmapSettings') {
            item.__type__ = 'cc.ModelBakeSettings';
        }
    }
}

export async function migrateBloomThreshold(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    for (const item of json) {
        if (item.__type__ === 'cc.Bloom') {
            if ('_threshold' in item) {
                if (item._threshold) {
                    const rowData = item._threshold as number;
                    item._threshold = linearToSRGB(rowData);
                    break;
                }
            }
        }
    }
}

export async function migratePrefabParentNull(asset: Asset): Promise<boolean> {
    if (asset.extname !== '.prefab') return true;
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));

    function checkChildren(node: any, parentID: string) {
        if (node._children) {
            for (let index = node._children.length - 1; index >= 0; index--) {
                const childRef = node._children[index];
                const child = json[childRef.__id__];
                if (child) {
                    if (child._parent === null) {
                        child._parent = { __id__: parentID };
                        node._children.splice(index, 1);
                    } else {
                        checkChildren(child, childRef.__id__);
                    }
                }
            }
        }
    }
    const rootRef = json[0]?.data;
    if (!rootRef.__id__) return false;

    const root = json[rootRef.__id__];
    if (!root) return false;
    checkChildren(root, rootRef.__id__);

    return true;
}

export async function migrateFXAA(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (const item of json) {
        if (item.__type__ === 'cc.Fxaa') {
            item.__type__ = 'cc.FXAA';
        }
    }
}
