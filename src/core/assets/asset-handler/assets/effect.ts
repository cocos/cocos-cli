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
                    name: 'default',
                },
                {
                    label: 'i18n:ENGINE.assets.newSurfaceEffect',
                    fullFileName: 'surface-effect.effect',
                    template: `db://internal/default_file_content/${EffectHandler.name}/effect-surface.effect`,
                    group: 'effect',
                    name: 'surface',
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
    if (!effectList.length) {
        console.debug('no effect to compile');
        return;
    }
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
