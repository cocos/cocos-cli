/* eslint-disable no-useless-escape */

import { Asset, AssetDB, forEach } from '@editor/asset-db';
import { AssetHandler, IAsset } from '../../@types/protected';
import { EffectAsset } from 'cc';
import {
    BinaryOutputArchive,
    LayoutGraphData,
    saveLayoutGraphData,
    VisibilityGraph,
    LayoutGraphInfo,
    buildLayoutGraphData,
    getLayoutGraphDataVersion,
} from 'cc/editor/custom-pipeline';
import { existsSync, readFileSync, writeFileSync, ensureDir, readJSON, writeFile } from 'fs-extra';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { buildEffect, options, addChunk } from '../../effect-compiler';

import { getDependUUIDList, openCode } from '../utils';
import zlib from 'zlib';
import assetConfig from '../../asset-config';

export interface IChunkInfo {
    name: string | undefined;
    content: string | undefined;
}
// 当某个头文件请求没找到，尝试把这个请求看成相对当前 effect 的路径，返回实际头文件路径再尝试找一下
const closure = { root: '', dir: '' };
options.throwOnWarning = true; // be more strict on the user input for now
options.skipParserTest = true; // we are guaranteed to have GL backend test here, so parser tests are not really that helpful anyways
options.getAlternativeChunkPaths = (path: string) => {
    return [relative(closure.root, resolve(closure.dir, path)).replace(/\\/g, '/')];
};
// 依然没有找到时，可能是依赖头文件还没有注册，尝试去每个 DB 搜一遍
options.chunkSearchFn = (names: string[]) => {
    const res: IChunkInfo = { name: undefined, content: undefined };
    forEach((db: AssetDB) => {
        if (res.content !== undefined) {
            return;
        }
        for (let i = 0; i < names.length; i++) {
            // user input path first
            const name = names[i];
            const file = resolve(db.options.target, 'chunks', name + '.chunk');
            if (!existsSync(file)) {
                continue;
            }
            res.name = name;
            res.content = readFileSync(file, { encoding: 'utf-8' });
            break;
        }
    });
    return res;
};

const migrations = [
    {
        version: '1.3.7',
        migrate: migrateEditorProps,
    },
    {
        version: '1.4.2',
        migrate: migrateUVAttribute,
    },
    {
        version: '1.4.7',
        migrate: migrateStandardTransparent,
    },
    {
        version: '1.4.8',
        migrate: migrateApplyFog,
    },
    {
        version: '1.4.9',
        migrate: (asset: Asset) => {
            migrateMacroToFunction(asset);
            migrateEnableDirShadow(asset);
        },
    },
    {
        version: '1.5.0',
        migrate: migrateMacroToFunction,
    },
    {
        version: '1.5.1',
        migrate: migrateShadowFactorParameter,
    },
    {
        version: '1.5.2',
        migrate: migrateDefines,
    },
    {
        version: '1.5.3',
        migrate: migrateIncludeDecodeBase,
    },
    {
        version: '1.5.4',
        migrate: migrateSpecularIntensity,
    },
    {
        version: '1.5.5',
        migrate: migrateUnpackLightingMap,
    },
    {
        version: '1.5.6',
        migrate: migrateMacroUseLightMap,
    },
    {
        version: '1.5.7',
        migrate: migrateChunkFolders,
    },
    {
        version: '1.5.8',
        migrate: migrateCSMInclude,
    },
    {
        version: '1.6.0',
        migrate: migrateMacroUseBatching,
    },
    {
        version: '1.6.1',
        migrate: migrateGetLightingMapAlpha,
    },
    {
        version: '1.7.1',
        migrate: migrateCalculatePlanarShadowClipPos,
    },
];

export const autoGenEffectBinInfo: {
    autoGenEffectBin: boolean;
    waitingGenEffectBin: boolean;
    waitingGenEffectBinTimmer: NodeJS.Timeout | null;
} = {
    // 是否要在导入 effect 后自动重新生成 effect.bin
    autoGenEffectBin: false,
    waitingGenEffectBin: false,
    waitingGenEffectBinTimmer: null,
};

export const EffectHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'effect',

    // 引擎内对应的类型
    assetType: 'cc.EffectAsset',

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newEffect',
                    fullFileName: 'effect.effect',
                    template: `db://internal/default_file_content/${EffectHandler.name}/default.effect`,
                    group: 'effect',
                },
                {
                    label: 'i18n:ENGINE.assets.newSurfaceEffect',
                    fullFileName: 'surface-effect.effect',
                    template: `db://internal/default_file_content/${EffectHandler.name}/effect-surface.effect`,
                    group: 'effect',
                },
            ];
        },
    },

    open: openCode,

    customOperationMap: {
        /**
         * 编译 effect
         * @param name - 用于自定义 buildEffect 后 Effect 的名字
         * @param effectContent - 用于自定义 effect 内容
         * @return { IEffectInfo | null }
         */
        'build-effect': {
            async operator(name: string, effectContent: string) {
                try {
                    return buildEffect(name, effectContent);
                } catch (e) {
                    console.error(e);
                    return null;
                }
            },
        },

        /**
         * 添加着色器片段
         * @param name - 着色器片段的名字
         * @param content - 着色器片段具体内容
         */
        'add-chunk': {
            async operator(name: string, content: string) {
                addChunk(name, content);
            },
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.7.1',
        migrations,
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         * @param asset
         */
        async import(asset: IAsset) {
            try {
                if (asset instanceof Asset) {
                    await generateEffectAsset(asset, asset.source, asset.source);
                } else {
                    await generateEffectAsset(asset, asset.parent!.source, asset.parent!.getFilePath('.effect'));
                }
                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        },
    },
};

export default EffectHandler;

/**
 * 在 library 里生成对应的 effectAsset 对象
 * @param asset 资源数据
 * @param sourceFile
 */
async function generateEffectAsset(asset: IAsset, assetSourceFile: string, effectSourceFile: string) {
    const target = asset._assetDB.options.target;
    closure.root = join(target, 'chunks');
    closure.dir = dirname(assetSourceFile);
    const path = relative(join(target, 'effects'), closure.dir).replace(/\\/g, '/');
    const name = path + (path.length ? '/' : '') + basename(effectSourceFile, extname(effectSourceFile));

    const content = readFileSync(effectSourceFile, { encoding: 'utf-8' });
    const effect = buildEffect(name, content);

    // 记录 effect 的头文件依赖
    forEach((db: AssetDB) => {
        for (const header of effect.dependencies) {
            asset.depend(resolve(db.options.target, 'chunks', header + '.chunk'));
        }
    });

    const result = new EffectAsset();
    Object.assign(result, effect);

    // 引擎数据结构不变，保留 hideInEditor 属性
    if (effect.editor && effect.editor.hide) {
        result.hideInEditor = true;
    }

    // 添加 meta 文件中的 combinations
    if (asset.userData) {
        if (asset.userData.combinations) {
            result.combinations = asset.userData.combinations;
        }

        if (effect.editor) {
            asset.userData.editor = effect.editor;
        } else {
            // 已存在的需要清空
            asset.userData.editor = undefined;
        }
    }

    const serializeJSON = EditorExtends.serialize(result);
    await asset.saveToLibrary('.json', serializeJSON);

    const depends = getDependUUIDList(serializeJSON);
    asset.setData('depends', depends);
    autoGenEffectBinInfo.waitingGenEffectBin = true;

    if (asset._assetDB.flag.started && autoGenEffectBinInfo.autoGenEffectBin) {
        // 导入 500ms 后自动重新编译所有 effect
        autoGenEffectBinInfo.waitingGenEffectBinTimmer && clearTimeout(autoGenEffectBinInfo.waitingGenEffectBinTimmer);
        autoGenEffectBinInfo.waitingGenEffectBinTimmer = setTimeout(() => {
            afterImport();
        }, 500);
    }
}

function _rebuildDescriptorHierarchy(effectArray: Asset[]) {
    const effects = [];
    for (const effectAsset of effectArray) {
        // 临时文件路径
        const tempFile = join(effectAsset.temp, 'materialxxx.json');
        // 这个 temp 文件夹在资源重新导入的时候，会被清空
        // 所以判断我们的缓存是否存在，就可以知道这个资源有没有被修改，需不需要重新计算
        if (existsSync(tempFile)) {
            // 跳过之前已经计算的 effect
            continue;
        }
        effects.push(effectAsset);
    }
    return effects;
}

async function buildCustomLayout(currEffectArray: Asset[], lgData: LayoutGraphData) {
    // 收集所有 Descriptor 的 Visibility 信息
    const visg = new VisibilityGraph();
    for (const effectAsset of currEffectArray) {
        const libraryFile = effectAsset.library + '.json';
        const json = await readJSON(libraryFile);
        // @ts-ignore TS2339
        const effect = cc.deserialize(json) as EffectAsset;
        // 合并所有 effect 的 visibility 信息
        visg.mergeEffect(effect);
    }

    const lgInfo = new LayoutGraphInfo(visg);
    for (const effectAsset of currEffectArray) {
        // 导入后的 effectAsset json，引擎类型序列化后的数据
        const libraryFile = effectAsset.library + '.json';

        const json = await readJSON(libraryFile);

        // @ts-ignore TS2339
        const effect = cc.deserialize(json) as EffectAsset;

        // 添加 effect
        lgInfo.addEffect(effect);
    }
    if (lgInfo.build()) {
        console.error('build failed');
    }
    buildLayoutGraphData(lgInfo.lg, lgData);
}

/** source/contributions/asset-db-hook
 * effect 导入器比较特殊，单独增加了一个在所有 effect 导入完成后的钩子
 * 这个函数名字是固定的，如果需要修改，需要一同修改 cocos-editor 仓库里的 asset-db 插件代码
 * @param effectArray
 * @param force 强制重编
 */
export async function afterImport(force?: boolean) {
    const effectList: Asset[] = [];
    forEach((database: AssetDB) => {
        database.path2asset.forEach((asset) => {
            if (asset.meta.importer === 'effect') {
                effectList.push(asset);
            }
        });
    });
    await recompileAllEffects(effectList, force);
}

function forceRecompileEffects(file: string): boolean {
    const data = readFileSync(file, { encoding: 'binary' });
    const effect = Buffer.from(data, 'binary');

    if (effect.length < 8) {
        console.error('effect.bin size is too small');
        return true;
    }

    // Read header
    const numVertices = effect.readUint32LE();

    // Check if engine supports compressed effect
    const isEngineSupportCompressedEffect = !!getLayoutGraphDataVersion;
    const isBinaryCompressed = numVertices === 0xffffffff;

    //------------------------------------------------------------------
    // Engine does not support compressed effect
    //------------------------------------------------------------------
    if (!isEngineSupportCompressedEffect) {
        // 1. Binary is compressed, need to recompile
        // 2. Binary is uncompressed, no need to recompile
        return isBinaryCompressed;
    }

    //------------------------------------------------------------------
    // Engine supports compressed effect
    //------------------------------------------------------------------
    // 3. Binary is uncompressed (Incompatible)
    if (!isBinaryCompressed) {
        return true;
    }

    // Check binary version
    // 4. Engine compressed, Binary compressed (Compatible)
    const requiredVersion = getLayoutGraphDataVersion();
    const binaryVersion = effect.readUint32LE(4);

    // a) Version is different
    if (binaryVersion < requiredVersion) {
        return true;
    } else if (binaryVersion > requiredVersion) {
        console.debug(`effect.bin version ${binaryVersion} is newer than required version ${requiredVersion}`);
        return true;
    }

    // b) Version is the same
    return false;
}

/**
 * 编译所有的 effect
 * 调用入口：source/contributions/asset-db-script
 * 调用入口：this.afterImport
 * @param effectArray
 * @param force 强制重编
 */
export async function recompileAllEffects(effectArray: Asset[], force?: boolean) {
    const file = join(assetConfig.data.tempRoot, 'asset-db/effect/effect.bin');
    // 存在等待刷新的指令或者 effect.bin 不存在时，就重新生成
    if (force || autoGenEffectBinInfo.waitingGenEffectBin || !existsSync(file) || forceRecompileEffects(file)) {
        // 仅编译导入正常的 effect
        effectArray = effectArray.filter((asset) => asset.imported);
        autoGenEffectBinInfo.waitingGenEffectBin = false;
        autoGenEffectBinInfo.waitingGenEffectBinTimmer && clearTimeout(autoGenEffectBinInfo.waitingGenEffectBinTimmer);
        const lgData = new LayoutGraphData();
        await buildCustomLayout(effectArray, lgData);
        // 写入一个二进制文件
        // 记得做好缓存管理，如果没有变化尽量减少 io
        await ensureDir(dirname(file));

        // Serialize data
        const binaryData = new BinaryOutputArchive();
        saveLayoutGraphData(binaryData, lgData);

        const isEngineSupportCompressedEffect = !!getLayoutGraphDataVersion;
        if (isEngineSupportCompressedEffect) {
            // Compress data
            const compressed = zlib.deflateSync(binaryData.buffer, {
                level: zlib.constants.Z_BEST_COMPRESSION,
            });

            // Pack data
            const packedData = Buffer.alloc(compressed.length + 8);
            const version = getLayoutGraphDataVersion();
            packedData.writeUint32LE(0xffffffff, 0); // graph null vertex descriptor
            packedData.writeUint32LE(version, 4); // version
            packedData.set(compressed, 8); // data

            // Write to file
            await writeFile(file, packedData);
        } else {
            await writeFile(file, binaryData.buffer);
        }

        console.debug('recompile effect.bin success');
    }
}

const inspectorRE = /inspector\s*:/g;
function migrateEditorProps(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    effect = effect.replace(inspectorRE, 'editor:');
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const UVAttribute = /in\s*vec2\s*a_texCoord\s*;/;
const inputIncludeRE = /include.*input/;
function migrateUVAttribute(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(inputIncludeRE)) {
        effect = effect.replace(UVAttribute, '');
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const MacroStandardTransparent = /CC_STANDARD_TRANSPARENT/g;
const ReplaceTransparentWithForward = 'CC_FORCE_FORWARD_SHADING';
function migrateStandardTransparent(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(MacroStandardTransparent)) {
        effect = effect.replace(MacroStandardTransparent, ReplaceTransparentWithForward);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const MacroApplyFog = /[a-zA-Z_][a-zA-Z_0-9]*\s*=\s*CC_APPLY_FOG/g;
const ReplaceApplyFog = 'CC_APPLY_FOG';
const MacroTransferFog = /[a-zA-Z_][a-zA-Z_0-9]*\s*=\s*CC_TRANSFER_FOG/g;
const ReplaceTransferFog = 'CC_TRANSFER_FOG';
function migrateApplyFog(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(MacroApplyFog)) {
        effect = effect.replace(MacroApplyFog, ReplaceApplyFog);
    }
    if (effect.match(MacroTransferFog)) {
        effect = effect.replace(MacroTransferFog, ReplaceTransferFog);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const MacroEnableDirShadow = /&&\s*CC_ENABLE_DIR_SHADOW/g;
const ReplaceEnableDirShadow = '';
export function migrateEnableDirShadow(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(MacroEnableDirShadow)) {
        effect = effect.replace(MacroEnableDirShadow, ReplaceEnableDirShadow);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const MacroShadowFactor = /CC_SHADOW_FACTOR\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceShadowFactor = '$1 = CCShadowFactorBase(CC_SHADOW_POSITION, $2)';
const MacroShadowFactorBase = /CC_SHADOW_FACTOR_BASE\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceShadowFactorBase = '$1 = CCShadowFactorBase($2, $3)';
const MacroSpotShadowFactor = /CC_SPOT_SHADOW_FACTOR\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceSpotShadowFactor = '$1 = CCSpotShadowFactorBase(CC_SHADOW_POSITION, $2)';
const MacroSpotShadowFactorBase =
    /CC_SPOT_SHADOW_FACTOR_BASE\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceSpotShadowFactorBase = '$1 = CCSpotShadowFactorBase($2, $3)';
function migrateMacroToFunction(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(MacroShadowFactorBase)) {
        effect = effect.replace(MacroShadowFactorBase, ReplaceShadowFactorBase);
    }
    if (effect.match(MacroShadowFactor)) {
        effect = effect.replace(MacroShadowFactor, ReplaceShadowFactor);
    }
    if (effect.match(MacroSpotShadowFactorBase)) {
        effect = effect.replace(MacroSpotShadowFactorBase, ReplaceSpotShadowFactorBase);
    }
    if (effect.match(MacroSpotShadowFactor)) {
        effect = effect.replace(MacroSpotShadowFactor, ReplaceSpotShadowFactor);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const ShadowFactorBaseParameter = /CCShadowFactorBase\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceShadowFactorBaseParameter = 'CCShadowFactorBase($1, $2, vec2(0.0, 0.0))';
const SpotShadowFactorBaseParameter = /CCSpotShadowFactorBase\s*\(\s*([\w.\[\]]+)\s*,\s*([\w.\[\]]+)\s*\)/g;
const ReplaceSpotShadowFactorBaseParameter = 'CCSpotShadowFactorBase($1, $2, vec2(0.0, 0.0))';
function migrateShadowFactorParameter(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(ShadowFactorBaseParameter)) {
        effect = effect.replace(ShadowFactorBaseParameter, ReplaceShadowFactorBaseParameter);
    }
    if (effect.match(SpotShadowFactorBaseParameter)) {
        effect = effect.replace(SpotShadowFactorBaseParameter, ReplaceSpotShadowFactorBaseParameter);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const DefineMetaRE = /#pragma\s+define\s+/g;
const DefineRE = /#define/g;
export function migrateDefines(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    effect = effect.replace(DefineMetaRE, '#pragma define-meta ');
    effect = effect.replace(DefineRE, '#pragma define');
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const IncludeLocalBatch1 = /(\s*)#include\s*<cc-local-batch>/g;
const IncludeLocalBatch2 = /(\s*)#include\s*"cc-local-batch"/g;
const ReplaceIncludeLocalBatch = '$1#include <decode-base>$1#include <cc-local-batch>';
export function migrateIncludeDecodeBase(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(IncludeLocalBatch1)) {
        effect = effect.replace(IncludeLocalBatch1, ReplaceIncludeLocalBatch);
    }
    if (effect.match(IncludeLocalBatch2)) {
        effect = effect.replace(IncludeLocalBatch2, ReplaceIncludeLocalBatch);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const MetallicParam = /(\s*)s.metallic\s*=/g;
const ReplaceMetallicParam = '$1s.specularIntensity = 0.5;$1s.metallic =';
function migrateSpecularIntensity(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(MetallicParam)) {
        effect = effect.replace(MetallicParam, ReplaceMetallicParam);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const UnpackLightingMap = /UnpackLightingmap\s*\(\s*([\w.\[\]]+)\s*\)/g;
const ReplaceUnpackLightingMap = '$1.rgb';
function migrateUnpackLightingMap(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(UnpackLightingMap)) {
        effect = effect.replace(UnpackLightingMap, ReplaceUnpackLightingMap);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const UseLightMap = /(\s+)USE_LIGHTMAP/g;
const ReplaceUseLightMap = '$1CC_USE_LIGHTMAP';
export function migrateMacroUseLightMap(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(UseLightMap)) {
        effect = effect.replace(UseLightMap, ReplaceUseLightMap);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const CCShadow = /(\s*)#include\s*<builtin\/uniforms\/cc-shadow>/g;
const ReplaceCCShadow =
    '$1#include <builtin/uniforms/cc-shadow>\n#if CC_SUPPORT_CASCADED_SHADOW_MAP\n  #include <builtin/uniforms/cc-csm>\n#endif';
export function migrateCSMInclude(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(CCShadow)) {
        effect = effect.replace(CCShadow, ReplaceCCShadow);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const CCBatching = /&&\s+!USE_BATCHING\s*/g;
export function migrateMacroUseBatching(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(CCBatching)) {
        effect = effect.replace(CCBatching, '');
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

const UseShadingStandBaseInclude = /#include.*standard-surface-entry/g;
const GetLightingMapAlpha1 = /(\s*)s.lightmap.rgb\s*=\s*([a-zA-Z]+)/g;
const GetLightingMapAlpha2 = /(\s*)s.lightmap\s*=\s*([a-zA-Z]+)/g;
const ReplaceGetLightingMapAlpha = '$1s.lightmap.a = $2.a;$1s.lightmap.rgb = $2';
function migrateGetLightingMapAlpha(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(UseShadingStandBaseInclude)) {
        if (effect.match(GetLightingMapAlpha1)) {
            effect = effect.replace(GetLightingMapAlpha1, ReplaceGetLightingMapAlpha);
        }
        if (effect.match(GetLightingMapAlpha2)) {
            effect = effect.replace(GetLightingMapAlpha2, ReplaceGetLightingMapAlpha);
        }
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}

export function migrateChunkFolders(asset: Asset) {
    const includeMap = new Map([
        ['cc-fog-base', 'legacy/fog-base'], // existed, already modified
        ['cc-shadow-map-base', 'legacy/shadow-map-base'],
        ['morph', 'legacy/morph'],
        ['cc-skinning', 'legacy/skinning'],
        ['cc-local-batch', 'legacy/local-batch'],
        ['lighting', 'legacy/lighting'],
        ['lightingmap-fs', 'legacy/lightingmap-fs'],

        ['cc-shadow-map-vs', 'legacy/shadow-map-vs'], // move without any modifying
        ['cc-shadow-map-fs', 'legacy/shadow-map-fs'],
        ['cc-fog-vs', 'legacy/fog-vs'],
        ['cc-fog-fs', 'legacy/fog-fs'],
        ['lightingmap-vs', 'legacy/lightingmap-vs'],
        ['decode', 'legacy/decode'],
        ['decode-base', 'legacy/decode-base'],
        ['decode-standard', 'legacy/decode-standard'],
        ['input', 'legacy/input'],
        ['input-standard', 'legacy/input-standard'],
        ['output', 'legacy/output'],
        ['output-standard', 'legacy/output-standard'],
        ['shading-standard', 'legacy/shading-standard'],
        ['shading-standard-base', 'legacy/shading-standard-base'],
        ['shading-standard-additive', 'legacy/shading-standard-additive'],
        ['shading-cluster-additive', 'legacy/shading-cluster-additive'],
        ['shading-toon', 'legacy/shading-toon'],
        ['standard-surface-entry', 'legacy/standard-surface-entry'],

        ['alpha-test', 'builtin/internal/alpha-test'],
        ['cc-sprite-common', 'builtin/internal/sprite-common'],
        ['cc-sprite-texture', 'builtin/internal/sprite-texture'],
        ['embedded-alpha', 'builtin/internal/embedded-alpha'],
        ['particle-common', 'builtin/internal/particle-common'],

        ['cc-global', 'builtin/uniforms/cc-global'],
        ['cc-local', 'builtin/uniforms/cc-local'],
        ['cc-forward-light', 'builtin/uniforms/cc-forward-light'],
        ['cc-environment', 'builtin/uniforms/cc-environment'],
        ['cc-diffusemap', 'builtin/uniforms/cc-diffusemap'],
        ['cc-shadow', 'builtin/uniforms/cc-shadow'],
        ['cc-csm', 'builtin/uniforms/cc-csm'],
        ['cc-world-bound', 'builtin/uniforms/cc-world-bound'],
        ['builtin/uniforms/cc-skinning-uniforms', 'builtin/uniforms/cc-skinning'],

        ['common', 'common/common-define'],
        ['texture-lod', 'common/texture/texture-lod'],
        ['packing', 'common/data/packing'],
        ['unpack', 'common/data/unpack'],
        ['aces', 'common/color/aces'],
        ['gamma', 'common/color/gamma'],
        ['octahedron-transform', 'common/math/octahedron-transform'],
        ['transform', 'common/math/transform'],
        ['rect-area-light', 'common/lighting/rect-area-light'],

        ['fxaa', 'post-process/fxaa'],
        ['anti-aliasing', 'post-process/anti-aliasing'],
    ]);
    const mainFunctionMap = new Map([
        ['vert:\\s+particle-vs-gpu', 'vert: builtin/internal/particle-vs-gpu'],
        ['vert:\\s+particle-vs-legacy', 'vert: builtin/internal/particle-vs-legacy'],
        ['vert:\\s+particle-trail', 'vert: builtin/internal/particle-trail'],
        ['vert:\\s+outline-vs', 'vert: legacy/main-functions/outline-vs'],
        ['frag:\\s+outline-fs', 'frag: legacy/main-functions/outline-fs'],
        ['vert:\\s+general-vs', 'vert: legacy/main-functions/general-vs'],
        ['CCGetShadowFactorSoft2X', 'CCGetDirLightShadowFactorSoft3X'],
        ['CCGetShadowFactorSoft', 'CCGetDirLightShadowFactorSoft'],
        ['CCGetShadowFactorHard', 'CCGetDirLightShadowFactorHard'],
        ['CCGetSpotLightShadowFactorSoft2X', 'CCGetSpotLightShadowFactorSoft3X'],
    ]);

    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    let needSave = false;

    for (const [key, value] of includeMap) {
        const find1 = new RegExp('#include\\s+<' + key + '>', 'g');
        const find2 = new RegExp('#include\\s+"' + key + '"', 'g');
        const replace = '#include <' + value + '>';
        if (effect.match(find1)) {
            effect = effect.replace(find1, replace);
            needSave = true;
        }
        if (effect.match(find2)) {
            effect = effect.replace(find2, replace);
            needSave = true;
        }
    }
    for (const [key, value] of mainFunctionMap) {
        const find = new RegExp(key, 'g');
        const replace = value;
        if (effect.match(find)) {
            effect = effect.replace(find, replace);
            needSave = true;
        }
    }

    if (needSave) {
        writeFileSync(asset.source, effect, { encoding: 'utf8' });
    }
}

const FindCalculatePlanarShadowClipPos = /(.*)\s*=\s*cc_matProj\s*\*\s*cc_matView\s*\*\s*vec4\((.*).xyz,\s*1.0\);/g;
const ReplaceCalculatePlanarShadowClipPos = '$1 = CalculatePlanarShadowClipPos($2, cc_cameraPos.xyz, cc_matView, cc_matProj, cc_nearFar);';
function migrateCalculatePlanarShadowClipPos(asset: Asset) {
    let effect = readFileSync(asset.source, { encoding: 'utf8' });
    if (effect.match(FindCalculatePlanarShadowClipPos)) {
        effect = effect.replace(FindCalculatePlanarShadowClipPos, ReplaceCalculatePlanarShadowClipPos);
    }
    writeFileSync(asset.source, effect, { encoding: 'utf8' });
}
