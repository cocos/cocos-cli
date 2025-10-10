/* eslint-disable no-useless-escape */
'use strict';

import { Asset, queryAsset } from '@editor/asset-db';
import { nameToId } from '@editor/asset-db/libs/utils';
import * as cc from 'cc';
import { readJSON, writeJSONSync } from 'fs-extra';
import { walk, walkAsync } from './utils';
import { linearToSRGB } from '../utils/equirect-cubemap-faces';
import utils from '../../../../base/utils';

/////////////////
// 版本升级

export const migrations = [

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

const widgetRE = /^cc.Widget$/i;

function getCompPrefabInfoStr() {
    return '[{"__type__": "cc.CompPrefabInfo","fileId": "3cUBXFJqdHqabkl+K4SlQ6"}]';
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
                    x: (1 << mi),
                    y: (1 << mi),
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
