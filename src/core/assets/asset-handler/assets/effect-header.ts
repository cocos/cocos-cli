import { Asset } from '@cocos/asset-db';
import { AssetHandler } from '../../@types/protected';
import { readFileSync, readdirSync, statSync } from 'fs-extra';
import { basename, dirname, extname, join, relative } from 'path';
import { addChunk } from '../../effect-compiler';
import { Engine } from '../../../engine';

// 添加所有 builtin 头文件
const builtinChunkDir = join(Engine.getInfo().typescript.path, './editor/assets/chunks');
const builtinChunks = (() => {
    const arr: string[] = [];
    function step(dir: string) {
        const names = readdirSync(dir);
        names.forEach((name) => {
            const file = join(dir, name);
            if (/\.chunk$/.test(name)) {
                arr.push(file);
            } else if (statSync(file).isDirectory()) {
                step(file);
            }
        });
    }
    step(builtinChunkDir);
    return arr;
})();

for (let i = 0; i < builtinChunks.length; ++i) {
    const name = basename(builtinChunks[i], '.chunk');
    const content = readFileSync(builtinChunks[i], { encoding: 'utf8' });
    addChunk(name, content);
}

export const EffectHeaderHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'effect-header',
    // 引擎内对应的类型
    assetType: 'cce.EffectHeader',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newChunk',
                    fullFileName: 'chunk.chunk',
                    template: `db://internal/default_file_content/${EffectHeaderHandler.name}/chunk`,
                    name: 'default',
                },
            ];
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.7',

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
                const target = asset._assetDB.options.target;
                const path = relative(join(target, 'chunks'), dirname(asset.source)).replace(/\\/g, '/');
                const name = path + (path.length ? '/' : '') + basename(asset.source, extname(asset.source));

                const content = readFileSync(asset.source, { encoding: 'utf-8' });
                addChunk(name, content);

                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        },
    },
};

export default EffectHeaderHandler;
