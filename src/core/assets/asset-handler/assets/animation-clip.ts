'use strict';

import { Asset } from '@editor/asset-db';
import { animation, AnimationClip, js } from 'cc';
import { readJSON, readJSONSync, readFile } from 'fs-extra';
import { basename } from 'path';
import { migrateAnimationClip330 } from './migrates/migrate-animation-clip-3-3-0';
import { migrateImageUuid, migrateNameToId, _renameMap } from './scene/migrates';
import { Archive, migrationHook } from './utils/migration-utils';
import { serializeForLibrary } from './utils/serialize-library';
import * as cc from 'cc';
import fs from 'fs-extra';
import ps from 'path';
import { ArchiveSpace } from './migrates/archive-space';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

interface IAnimationUserData {
    name: string;
}

const AnimationHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'animation-clip',
    // 引擎内对应的类型
    assetType: 'cc.AnimationClip',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newAnimation',
                    fullFileName: 'animation.anim',
                    template: `db://internal/default_file_content/${AnimationHandler.name}/default.anim`,
                    group: 'animation',
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '2.0.4',
        versionCode: 2,
        migrations: [
            {
                // 这个版本之前的 scene 资源都会进行迁移
                version: '1.0.2',
                migrate: migrateImageUuid,
            },
            {
                version: '1.0.3',
                migrate: migrate_1_0_3,
            },
            {
                version: '1.0.4',
                async migrate(asset: Asset) {
                    await migrateNameToId(asset, true);
                },
            },
            {
                version: '1.0.5',
                migrate: migrateNameToId,
            },
            {
                version: '1.0.6',
                migrate: migrateType,
            },
            {
                version: '1.0.7',
                migrate: migrateSharedMaterials,
            },
            {
                version: '1.0.8',
                migrate: migrate_1_0_8,
            },
            {
                version: '1.0.10',
                migrate: migrate_1_0_10,
            },
            {
                version: '1.0.11',
                migrate: migrateComponentNames,
            },
            {
                version: '2.0.0',
                migrate: async (asset: Asset) => {
                    const swap: any = asset.getSwapSpace();
                    const archive = new Archive(swap.json);
                    await migrateAnimationClip330(archive);
                    const archiveResult = archive.get();
                    // @ts-ignore
                    swap.json = archiveResult;
                },
            },
        ],
        /**
         * 数据迁移的钩子函数
         */
        migrationHook: {
            ...migrationHook,
            async pre(asset: Asset) {
                try {
                    const sourceBackupLocation = ps.join(asset.temp, 'migration-backup', 'source');
                    const metaBackupLocation = ps.join(asset.temp, 'migration-backup', 'meta');
                    await fs.ensureDir(ps.dirname(sourceBackupLocation));
                    await fs.copyFile(asset.source, sourceBackupLocation);
                    await fs.ensureDir(ps.dirname(metaBackupLocation));
                    await fs.copyFile(`${asset.source}.meta`, metaBackupLocation);
                } catch (err) {
                    console.error(`Error when attempt to save asset ${asset.source} before migration.`);
                }
                return await migrationHook.pre(asset);
            },
            async post(asset: Asset, num: number) {
                return await migrationHook.post(asset, num);
            },
        },

        /**
         * 如果改名就强制刷新
         * @param asset
         */
        async force(asset: Asset) {
            const userData = asset.userData as IAnimationUserData;
            return userData.name !== asset.basename;
        },

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
            const userData = asset.userData as IAnimationUserData;
            try {
                const fileContent = await readFile(asset.source, 'utf8');
                const json = JSON.parse(fileContent);

                const details = cc.deserialize.Details.pool.get()!;
                const clip = cc.deserialize(json, details, undefined) as AnimationClip;
                const nUUIDRefs = details.uuidList!.length;
                for (let i = 0; i < nUUIDRefs; ++i) {
                    const uuid = details.uuidList![i];
                    const uuidObj = details.uuidObjList![i] as any;
                    const uuidProp = details.uuidPropList![i];
                    const uuidType = details.uuidTypeList[i];
                    const Type: new () => cc.Asset = (cc.js.getClassById(uuidType) as any) ?? cc.Asset;
                    const asset = new Type();
                    asset._uuid = uuid + '';
                    uuidObj[uuidProp] = asset;
                }

                clip.name = basename(asset.source, '.anim');
                userData.name = clip.name;

                // Compute hash
                void clip.hash;

                const { extension, data } = serializeForLibrary(clip);

                await asset.saveToLibrary(extension, data as any);

                const depends = getDependUUIDList(fileContent);
                asset.setData('depends', depends);
            } catch (error) {
                console.error(error);
                return false;
            }

            return true;
        },
    },
};

export default AnimationHandler;

const walkCCClass = (object: any, classname: string, handle: (obj: object) => void) => {
    if (Array.isArray(object)) {
        object.forEach((child: any) => {
            walkCCClass(child, classname, handle);
        });
    } else if (object && typeof object === 'object') {
        if (object.__type__ === classname) {
            handle(object);
        } else {
            for (const value of Object.values(object)) {
                walkCCClass(value, classname, handle);
            }
        }
    }
};

const walkCCClasses = (object: any, handlers: walkCCClasses.Handlers) => {
    if (Array.isArray(object)) {
        object.forEach((child: any, index) => {
            object[index] = walkCCClasses(child, handlers);
        });
    } else if (object && typeof object === 'object') {
        if (object.__type__ in handlers) {
            return handlers[object.__type__](object);
        } else {
            for (const key of Object.keys(object)) {
                object[key] = walkCCClasses(object[key], handlers);
            }
        }
    }
    return object;
};

namespace walkCCClasses {
    export type Handlers = Record<string, (object: any) => any>;
}

export async function migrate_1_0_3(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));
    walkCCClass(json, cc.js.getClassName(cc.AnimationClip), (object: Partial<{ _curves: any[]; curveDatas: {} }>) => {
        const { _curves, curveDatas } = object;
        // If nether `_curves` nor `curveDatas` is empty.
        // Delete _curves.
        if (Array.isArray(_curves) && _curves.length !== 0 && typeof curveDatas === 'object' && Object.keys(curveDatas).length !== 0) {
            delete object._curves;
        }
    });
    // writeJSONSync(asset.source, json, {
    //     spaces: 2,
    // });
}

export function changeCCType(object: any, name: string) {
    object.__type__ = name;
    return object;
}

export async function migrate_1_0_8(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));
    walkCCClasses(json, {
        ['cc.ComponentModifier']: (object) => {
            return changeCCType(object, js.getClassName(animation.ComponentPath));
        },
        ['cc.HierachyModifier']: (object) => {
            return changeCCType(object, js.getClassName(animation.HierarchyPath));
        },
        ['cc.UniformCurveValueAdapter']: (object) => {
            return changeCCType(object, js.getClassName(animation.UniformProxyFactory));
        },
    });
}

/**
 * Remove old `curveDatas` property of `AnimationClip`.
 */
export async function migrate_1_0_10(asset: Asset) {
    type CurveData = Record<
        string,
        {
            props: Record<string, AnimationClip._legacy.LegacyClipCurveData>;
            comps: Record<string, Record<string, AnimationClip._legacy.LegacyClipCurveData>>;
        }
    >;

    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    const archive = new Archive(json);

    archive.visitTypedObject(
        ArchiveSpace.ANIMATION_CLIP_TYPE_NAME,
        (serialized: { curveDatas?: CurveData; _curves?: AnimationClip._legacy.LegacyClipCurve[] }) => {
            if (!serialized.curveDatas) {
                return;
            }
            const curves = curveDatasToCurves(serialized.curveDatas);
            serialized._curves = curves;
            delete serialized.curveDatas;
        },
    );

    swap.json = archive.get();

    function createSerializedHierarchyPath(path: string): any {
        return {
            __type__: 'cc.animation.HierarchyPath',
            path,
        };
    }

    function createSerializedComponentPath(component: string): any {
        return {
            __type__: 'cc.animation.ComponentPath',
            component,
        };
    }

    function curveDatasToCurves(curveDatas: CurveData) {
        const curves: AnimationClip._legacy.LegacyClipCurve[] = [];
        for (const curveTargetPath of Object.keys(curveDatas)) {
            const hierarchyPath = createSerializedHierarchyPath(curveTargetPath);
            const nodeData = curveDatas[curveTargetPath];
            if (nodeData.props) {
                for (const nodePropertyName of Object.keys(nodeData.props)) {
                    const propertyCurveData = nodeData.props[nodePropertyName];
                    curves.push({
                        modifiers: [hierarchyPath, nodePropertyName],
                        data: propertyCurveData,
                    });
                }
            }
            if (nodeData.comps) {
                for (const componentName of Object.keys(nodeData.comps)) {
                    const componentPath = createSerializedComponentPath(componentName);
                    const componentData = nodeData.comps[componentName];
                    for (const componentPropertyName of Object.keys(componentData)) {
                        const propertyCurveData = componentData[componentPropertyName];
                        curves.push({
                            modifiers: [hierarchyPath, componentPath, componentPropertyName],
                            data: propertyCurveData,
                        });
                    }
                }
            }
        }
        return curves;
    }
}

async function migrateComponentNames(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any[] = swap.json || (await readJSON(asset.source));
    for (let i = 0; i < json.length; i++) {
        const comp = json[i];
        const newName = _renameMap[comp.component];
        if (newName) {
            comp.component = newName;
        }
    }
}

async function migrateType(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));

    if (json.__type__ !== 'cc.AnimationClip') {
        json.__type__ = 'cc.AnimationClip';
        // writeJSONSync(asset.source, json, {
        //     spaces: 2,
        // });
    }
}

async function migrateSharedMaterials(asset: Asset) {
    const swap: any = asset.getSwapSpace();
    const json: any = swap.json || (await readJSON(asset.source));
    if (!json) {
        return;
    }

    // 如果animation-clip对象中含有CCClass的属性的属性对象(例如有材质动画)，序列化后是一个数组
    const clip = json[0];
    if (!clip || clip.__type__ !== js.getClassName(AnimationClip)) {
        return;
    }

    const _curves = clip._curves;
    if (_curves && _curves.length > 0) {
        _curves.forEach((curve: any) => {
            if (curve) {
                const modifiers = curve.modifiers;
                // 目前只有renderable Component有打sharedMaterials
                if (modifiers && modifiers.length >= 2) {
                    if (modifiers[1] === 'sharedMaterials') {
                        modifiers[1] = 'materials';
                    }
                }
            }
        });
    }
}
