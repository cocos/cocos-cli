import fs from 'fs-extra';
import ps from 'path';
import concatWithSourceMap from 'concat-with-sourcemaps';

interface IMod {
    code: string;
    map?: string;
}

/**
 * 打包指定的所有脚本到一个单独的脚本中。
 * @param mods 
 * @param chunkMappings 
 * @param outFile 
 * @param options 
 */
export async function packMods(
    mods: IMod[],
    chunkMappings: Record<string, string>,
    outFile: string,
    options: {sourceMaps: boolean | 'inline', wrap?: boolean},
) {
    const { sourceMaps } = options;

    const concat = new concatWithSourceMap(true, 'all.js', '\n');

    if (options.wrap) {
        concat.add(null, 'System.register([], function(_export, _context) { return { execute: function () {');
    }

    for (const mod of mods) {
        concat.add(null, mod.code, mod.map);
    }

    if (Object.keys(chunkMappings).length !== 0) {
        concat.add(null, `\
(function(r) {
${Object.keys(chunkMappings).map((mapping) => `  r('${mapping}', '${chunkMappings[mapping]}');`).join('\n')} 
})(function(mid, cid) {
    System.register(mid, [cid], function (_export, _context) {
    return {
        setters: [function(_m) {
            var _exportObj = {};

            for (var _key in _m) {
              if (_key !== "default" && _key !== "__esModule") _exportObj[_key] = _m[_key];
            }
      
            _export(_exportObj);
        }],
        execute: function () { }
    };
    });
});\
`);
    }

    if (options.wrap) {
        concat.add(null, '} }; });');
    }

    if (sourceMaps && concat.sourceMap) {
        if (sourceMaps === 'inline') {
            const b64 = Buffer.from(concat.sourceMap).toString('base64');
            concat.add(null, `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}`);
        } else {
            concat.add(null, `//# sourceMappingURL=${ps.basename(outFile)}.map`);
        }
    }

    await fs.ensureDir(ps.dirname(outFile));
    await fs.writeFile(outFile, concat.content.toString());
    if (sourceMaps && concat.sourceMap && sourceMaps !== 'inline') {
        await fs.writeFile(`${outFile}.map`, concat.sourceMap);
    }

}
