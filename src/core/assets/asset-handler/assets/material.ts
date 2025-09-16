'use strict';

import { Asset, queryAsset, queryPath, VirtualAsset } from '@editor/asset-db';
import { outputJSON, outputJSONSync, readJSON, readJSONSync, writeJSONSync } from 'fs-extra';
import { migrateAnimationName, migrateImageUuid, migrateNameToId } from './scene/migrates';
import { upgradeProperties } from './utils/material-upgrader';

import { getDependUUIDList } from '../utils';
import { AssetHandler, IAsset, ICreateMenuInfo } from '../../@types/protected';
import { migrationHook } from './utils/migration-utils';

const migrations = [
    {
        version: '1.0.5',
        migrate: migrateImageUuid,
    },
    {
        version: '1.0.6',
        migrate: migrateAnimationName,
    },
    {
        version: '1.0.7',
        async migrate(asset: Asset) {
            await migrateNameToId(asset, true);
        },
    },
    {
        version: '1.0.9',
        migrate: migrateStandardEffect,
    },
    {
        version: '1.0.10',
        migrate: migrateLinearColor,
    },
    {
        version: '1.0.11',
        migrate: migrateBlendColor,
    },
    {
        version: '1.0.12',
        migrate: migrateLinearColorFixUnlitShader,
    },
    {
        version: '1.0.13',
        migrate: migrateNormalStrength,
    },
    {
        version: '1.0.14',
        migrate: migrateOcclusion,
    },
    {
        version: '1.0.15',
        migrate: migrateMacroUseBatching,
    },
    {
        version: '1.0.16',
        migrate: migrateRoughnessAndMetallic,
    },
    {
        version: '1.0.17',
        migrate: migrateEmissiveColor,
    },
    {
        version: '1.0.19',
        migrate: migrateAlbedoScaleType,
    },
    {
        version: '1.0.20',
        migrate: migrateEmissiveScaleType,
    },
    {
        version: '1.0.21',
        migrate: migrateSpecularIntensity,
    },
];

export const MaterialHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'material',

    // 引擎内对应的类型
    assetType: 'cc.Material',

    async validate(asset: Asset) {
        try {
            const json = readJSONSync(asset.source);
            return json.__type__ === 'cc.Material';
        } catch (error) {
            return false;
        }
    },

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newMaterial',
                    fullFileName: 'material.mtl',
                    template: `db://internal/default_file_content/${MaterialHandler.name}/default.mtl`,
                    group: 'material',
                },
            ];
            // const assets = Editor.Selection.getSelected('asset');
            // // 多选资源后，出现自动生成材质的菜单
            // if (assets.length) {
            //     menu.push({
            //         label: 'i18n:ENGINE.assets.autoGenerateMaterial',
            //         fullFileName: 'material.mtl',
            //         template: 'autoGenerateMaterial',
            //         group: 'material',
            //         message: {
            //             target: 'asset-db',
            //             name: 'new-asset',
            //             params: [{
            //                 template: 'autoGenerateMaterial',
            //                 handler: 'material',
            //             }],
            //         }
            //     })
            // }
            // return menu;
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.21',
        migrations,
        // 数据迁移的钩子函数
        migrationHook,

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            try {
                const material = readJSONSync(asset.source);

                // uuid dependency
                const uuid = material._effectAsset && material._effectAsset.__uuid__;
                asset.depend(uuid);

                // upgrade properties
                if (await upgradeProperties(material, asset)) {
                    writeJSONSync(asset.source, material, { spaces: 2 });
                }
                material._name = asset.basename || '';
                const serializeJSON = JSON.stringify(material, undefined, 2);
                await asset.saveToLibrary('.json', serializeJSON);

                const depends = getDependUUIDList(serializeJSON);
                asset.setData('depends', depends);

                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        },
    },
};

export default MaterialHandler;

const componentMap: Record<string, string> = { r: 'x', g: 'y', b: 'z', a: 'w' };
async function migrateStandardEffect(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    if (json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319') {
        // standard effect
        let defines = json._defines[0];
        if (!defines) {
            defines = json._defines[0] = {};
        }
        if (!defines.OCCLUSION_CHANNEL) {
            defines.OCCLUSION_CHANNEL = 'b';
        }
        if (!defines.ROUGHNESS_CHANNEL) {
            defines.ROUGHNESS_CHANNEL = 'r';
        }
        if (!defines.METALLIC_CHANNEL) {
            defines.METALLIC_CHANNEL = 'g';
        }

        let props = json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        props.occlusion =
            ((props.pbrParams && props.pbrParams[componentMap[defines.OCCLUSION_CHANNEL]]) || 1) *
            ((props.pbrScale && props.pbrScale[componentMap[defines.OCCLUSION_CHANNEL]]) || 1);
        props.roughness =
            ((props.pbrParams && props.pbrParams[componentMap[defines.ROUGHNESS_CHANNEL]]) || 1) *
            ((props.pbrScale && props.pbrScale[componentMap[defines.ROUGHNESS_CHANNEL]]) || 0.8);
        props.metallic =
            ((props.pbrParams && props.pbrParams[componentMap[defines.METALLIC_CHANNEL]]) || 1) *
            ((props.pbrScale && props.pbrScale[componentMap[defines.METALLIC_CHANNEL]]) || 0.6);
        if (defines.USE_PBR_MAP) {
            props.occlusion = props.pbrScale && props.pbrScale[componentMap[defines.OCCLUSION_CHANNEL]];
            if (typeof props.occlusion !== 'number') {
                props.occlusion = 1;
            }
            props.roughness = props.pbrScale && props.pbrScale[componentMap[defines.ROUGHNESS_CHANNEL]];
            if (typeof props.roughness !== 'number') {
                props.roughness = 1;
            }
            props.metallic = props.pbrScale && props.pbrScale[componentMap[defines.METALLIC_CHANNEL]];
            if (typeof props.metallic !== 'number') {
                props.metallic = 1;
            }
        } else if (defines.USE_METALLIC_ROUGHNESS_MAP) {
            props.roughness = props.pbrScale && props.pbrScale[componentMap[defines.ROUGHNESS_CHANNEL]];
            if (typeof props.roughness !== 'number') {
                props.roughness = 1;
            }
            props.metallic = props.pbrScale && props.pbrScale[componentMap[defines.METALLIC_CHANNEL]];
            if (typeof props.metallic !== 'number') {
                props.metallic = 1;
            }
        } else if (defines.USE_OCCLUSION_MAP) {
            props.occlusion = props.pbrScale && props.pbrScale[componentMap[defines.OCCLUSION_CHANNEL]];
            if (typeof props.occlusion !== 'number') {
                props.occlusion = 1;
            }
        }
    }
}

async function migrateLinearColor(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isStandard = json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319';
    const isToon = json._effectAsset.__uuid__ === 'a7612b54-35e3-4238-a1a9-4a7b54635839';
    const isUnlit = json._effectAsset.__uuid__ === 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';
    const isReflectionDeferred = json._effectAsset.__uuid__ === '99498f84-efe6-43a6-a9a7-e6e93eb845c1';

    if (isStandard || isToon || isReflectionDeferred) {
        let props = isToon ? json._props[1] : json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.mainColor) {
            props.mainColor.r = Math.floor(Math.sqrt(props.mainColor.r / 255.0) * 255);
            props.mainColor.g = Math.floor(Math.sqrt(props.mainColor.g / 255.0) * 255);
            props.mainColor.b = Math.floor(Math.sqrt(props.mainColor.b / 255.0) * 255);
        }
        if (props.emissive) {
            props.emissive.r = Math.floor(Math.sqrt(props.emissive.r / 255.0) * 255);
            props.emissive.g = Math.floor(Math.sqrt(props.emissive.g / 255.0) * 255);
            props.emissive.b = Math.floor(Math.sqrt(props.emissive.b / 255.0) * 255);
        }

        if (isToon) {
            if (props.shadeColor1) {
                props.shadeColor1.r = Math.floor(Math.sqrt(props.shadeColor1.r / 255.0) * 255);
                props.shadeColor1.g = Math.floor(Math.sqrt(props.shadeColor1.g / 255.0) * 255);
                props.shadeColor1.b = Math.floor(Math.sqrt(props.shadeColor1.b / 255.0) * 255);
            }

            if (props.shadeColor2) {
                props.shadeColor2.r = Math.floor(Math.sqrt(props.shadeColor2.r / 255.0) * 255);
                props.shadeColor2.g = Math.floor(Math.sqrt(props.shadeColor2.g / 255.0) * 255);
                props.shadeColor2.b = Math.floor(Math.sqrt(props.shadeColor2.b / 255.0) * 255);
            }

            if (props.specular) {
                props.specular.r = Math.floor(Math.sqrt(props.specular.r / 255.0) * 255);
                props.specular.g = Math.floor(Math.sqrt(props.specular.g / 255.0) * 255);
                props.specular.b = Math.floor(Math.sqrt(props.specular.b / 255.0) * 255);
            }
        }
    }

    if (isUnlit) {
        let props = json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.mainColor) {
            props.mainColor.r = Math.floor(Math.sqrt(props.mainColor.r / 255.0) * 255);
            props.mainColor.g = Math.floor(Math.sqrt(props.mainColor.g / 255.0) * 255);
            props.mainColor.b = Math.floor(Math.sqrt(props.mainColor.b / 255.0) * 255);
        }
    }
}

async function migrateLinearColorFixUnlitShader(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isUnlit = json._effectAsset.__uuid__ === 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';

    if (isUnlit) {
        let props = json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.mainColor) {
            props.mainColor.r = Math.floor(((props.mainColor.r * props.mainColor.r) / 65535.0) * 255);
            props.mainColor.g = Math.floor(((props.mainColor.g * props.mainColor.g) / 65535.0) * 255);
            props.mainColor.b = Math.floor(((props.mainColor.b * props.mainColor.b) / 65535.0) * 255);
        }
    }
}

async function migrateBlendColor(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));
    if (json._states && Array.isArray(json._states)) {
        json._states.forEach((state: any) => {
            const blendState = state.blendState;
            if (blendState && blendState.blendColor) {
                const blendColor = blendState.blendColor;
                if (Array.isArray(blendColor)) {
                    // change to cc.Color
                    blendState.blendColor = {
                        __type__: 'cc.Color',
                        r: blendColor[0] ?? 0,
                        g: blendColor[1] ?? 0,
                        b: blendColor[2] ?? 0,
                        a: blendColor[3] ?? 0,
                    };
                }
            }
        });
    }
}

async function migrateNormalStrength(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isStandard = json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319';
    const isToon = json._effectAsset.__uuid__ === 'a7612b54-35e3-4238-a1a9-4a7b54635839';

    if (isStandard || isToon) {
        let props = isToon ? json._props[1] : json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.normalStrenth !== undefined) {
            props.normalStrength = props.normalStrenth;
        }
    }
}

async function migrateOcclusion(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    let props = json._props[0];
    if (!props) {
        props = json._props[0] = {};
    }
    if (props.occlusion !== undefined) {
        props.occlusion = 1.0 - props.occlusion;
    }
}

async function migrateMacroUseBatching(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const defines = json._defines[0];
    if (defines) {
        if (defines.USE_BATCHING) {
            defines.USE_BATCHING = undefined;
        }
    }
}

async function migrateRoughnessAndMetallic(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isStandard = json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319';
    const isSurfaceStandard = json._effectAsset.__uuid__ === 'c8f66d17-351a-48da-a12c-0212d28575c4';

    if (isStandard || isSurfaceStandard) {
        let props = json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.roughness === undefined) {
            props.roughness = 0.8;
        }
        if (props.metallic === undefined) {
            props.metallic = 0.6;
        }
    }
}

async function migrateEmissiveColor(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isStandard = json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319';
    const isSurfaceStandard = json._effectAsset.__uuid__ === 'c8f66d17-351a-48da-a12c-0212d28575c4';

    if (isStandard || isSurfaceStandard) {
        let props = json._props[0];
        if (!props) {
            props = json._props[0] = {};
        }
        if (props.emissiveMap && props.emissive) {
            if (!props.emissiveScale) {
                props.emissiveScale = {
                    __type__: 'cc.Vec3',
                    x: 1.0,
                    y: 1.0,
                    z: 1.0,
                };
            }
            props.emissiveScale.x *= props.emissive.r / 255.0;
            props.emissiveScale.y *= props.emissive.g / 255.0;
            props.emissiveScale.z *= props.emissive.b / 255.0;
        }
    }
}

async function migrateAlbedoScaleType(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    for (let i = 0; i < json._props.length; i++) {
        const albedoScale = json._props[i].albedoScale;
        if (albedoScale && albedoScale.__type__ === 'cc.Vec4') {
            delete albedoScale.w;
            albedoScale.__type__ = 'cc.Vec3';
        }
    }
}

async function migrateEmissiveScaleType(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isStandard = json._effectAsset.__uuid__ === '1baf0fc9-befa-459c-8bdd-af1a450a0319';
    const isSurfaceStandard = json._effectAsset.__uuid__ === 'c8f66d17-351a-48da-a12c-0212d28575c4';

    if (isStandard || isSurfaceStandard) {
        for (let i = 0; i < json._props.length; i++) {
            const emissiveScale = json._props[i].emissiveScale;
            if (emissiveScale && emissiveScale.__type__ === 'cc.Vec4') {
                delete emissiveScale.w;
                emissiveScale.__type__ = 'cc.Vec3';
            }
        }
    }
}

async function migrateSpecularIntensity(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const isLeaf = json._effectAsset.__uuid__ === 'e396231e-43c6-4547-86f5-0ef92bf154ce';
    const isHair = json._effectAsset.__uuid__ === 'fc0ce5f8-063d-42da-b13a-2fad25abb951';

    // migrates dielectric smooth surfaces for fixed directGF with 3.8.1
    if (isLeaf || isHair) {
        for (let i = 0; i < json._props.length; i++) {
            const specularIntensity = json._props[i].specularIntensity;
            if (specularIntensity && specularIntensity <= 0.2) {
                json._props[i].specularIntensity = Math.min(specularIntensity * 10.0, 0.5);
            }
            if (isHair) {
                const intensityTRT = json._props[i].IntensityTRT;
                if (intensityTRT && intensityTRT <= 1.0) {
                    json._props[i].IntensityTRT = Math.min(intensityTRT * 3.0, 3.0);
                }
            }
        }
    }
}
