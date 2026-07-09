import * as ps from 'path';
import * as fsExtra from 'fs-extra';

/**
 * 修正 import-map 中无扩展名的模块映射值。
 *
 * 背景：`@cocos/quick-compiler` 的 `buildImportMap` 直接使用 `cc.config.json` 的 override
 * 字符串生成 import-map 的映射值，只做 `.ts→.js`/`.json→.js` 的扩展名转换。若 override 写成
 * 无扩展名(如 `pal/system-info/nodejs/system-info`)，生成的 `q-bundled:///fs/*` URL 也无
 * 扩展名，而 bundle 里模块是以输出扩展名 `.js` 注册的。编辑器/预览用的是**静态 import-map**
 * (运行期没有解析器补扩展名)，于是会去 fetch 无扩展名 URL 而失败。
 *
 * 这里在 import-map 生成后做一次后处理：把无扩展名的 `q-bundled:///fs/*` 值，按引擎目录下实际
 * 存在的源文件(`.js` 或 `.ts`)补成输出扩展名 `.js`(输出扩展名恒为 `.js`，`.ts` 也会被编译成
 * `.js`)。只加不改——已带扩展名(`.js`/`.mjs`/`.cjs`/`.jsx`/`.json`)、非 `fs` 值(如
 * `q-bundled:///virtual/cc.js`、外部 `cce:/*`)、或没有对应源文件的值都保持原样，因此对 vanilla
 * 引擎(override 本就带 `.ts`，生成值已是 `.js`)零影响。
 *
 * @param importMapFile import-map.json 路径。
 * @param enginePath 引擎根目录，用于校验 `fs/*` 值对应的源文件是否存在。
 * @returns 是否发生了修改(未修改时不重写文件)。
 */
export async function fixImportMapExtensions(importMapFile: string, enginePath: string): Promise<boolean> {
    let importMap: { imports?: Record<string, string> };
    try {
        importMap = await fsExtra.readJson(importMapFile);
    } catch {
        return false;
    }
    const imports = importMap && importMap.imports;
    if (!imports) {
        return false;
    }
    const prefix = 'q-bundled:///fs/';
    let changed = false;
    for (const key of Object.keys(imports)) {
        const value = imports[key];
        if (typeof value !== 'string' || !value.startsWith(prefix)) {
            continue;
        }
        const rel = value.slice(prefix.length);
        if (/\.[cm]?jsx?$|\.json$/i.test(rel)) {
            continue; // 已带扩展名
        }
        const relPath = decodeURIComponent(rel);
        if (fsExtra.existsSync(ps.join(enginePath, `${relPath}.js`))
            || fsExtra.existsSync(ps.join(enginePath, `${relPath}.ts`))) {
            imports[key] = `${value}.js`;
            changed = true;
        }
    }
    if (changed) {
        await fsExtra.outputJson(importMapFile, importMap, { spaces: 2 });
    }
    return changed;
}
