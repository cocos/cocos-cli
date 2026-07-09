import * as os from 'os';
import * as ps from 'path';
import * as fsExtra from 'fs-extra';
import { fixImportMapExtensions } from '../packages/engine-compiler/src/core/import-map-utils';

/**
 * 覆盖 engine-compiler 的 import-map 后处理：
 * pal 等 override 无扩展名时，编辑器/预览编译生成的静态 import-map 会停在无扩展名 URL，
 * 与 bundle 里以 .js 注册的模块错位。fixImportMapExtensions 负责按实际源文件补成 .js。
 */
describe('engine-compiler / fixImportMapExtensions', () => {
    let engineRoot: string;
    let importMapFile: string;

    beforeEach(async () => {
        engineRoot = await fsExtra.mkdtemp(ps.join(os.tmpdir(), 'engine-compiler-imap-'));
        importMapFile = ps.join(engineRoot, 'bin', '.cache', 'dev-cli', 'editor', 'import-map.json');
        // 造 pal 源文件：一个只有 .js（模拟私有包产物），一个只有 .ts（模拟本地源码调试）
        await fsExtra.outputFile(ps.join(engineRoot, 'pal/system-info/nodejs/system-info.js'), '// js');
        await fsExtra.outputFile(ps.join(engineRoot, 'pal/system-info/nodejs/system-info.d.ts'), '// dts');
        await fsExtra.outputFile(ps.join(engineRoot, 'pal/audio/tsonly/player.ts'), '// ts');
    });

    afterEach(async () => {
        await fsExtra.remove(engineRoot);
    });

    async function run(imports: Record<string, string>) {
        await fsExtra.outputJson(importMapFile, { imports });
        const changed = await fixImportMapExtensions(importMapFile, engineRoot);
        const result = (await fsExtra.readJson(importMapFile)).imports as Record<string, string>;
        return { changed, result };
    }

    it('无扩展名 + 有 .js 源文件 → 补成 .js', async () => {
        const { changed, result } = await run({
            'pal/system-info': 'q-bundled:///fs/pal/system-info/nodejs/system-info',
        });
        expect(changed).toBe(true);
        expect(result['pal/system-info']).toBe('q-bundled:///fs/pal/system-info/nodejs/system-info.js');
    });

    it('无扩展名 + 只有 .ts 源文件 → 也补成 .js（输出扩展名恒为 .js）', async () => {
        const { result } = await run({
            'pal/audio': 'q-bundled:///fs/pal/audio/tsonly/player',
        });
        expect(result['pal/audio']).toBe('q-bundled:///fs/pal/audio/tsonly/player.js');
    });

    it('无扩展名 + 无对应源文件 → 保持不变', async () => {
        const value = 'q-bundled:///fs/pal/does/not/exist';
        const { changed, result } = await run({ 'pal/missing': value });
        expect(changed).toBe(false);
        expect(result['pal/missing']).toBe(value);
    });

    it('已带 .js 扩展名 → 不变（vanilla / 私有化写 .js 的情况）', async () => {
        const value = 'q-bundled:///fs/pal/system-info/nodejs/system-info.js';
        const { changed, result } = await run({ 'pal/system-info': value });
        expect(changed).toBe(false);
        expect(result['pal/system-info']).toBe(value);
    });

    it('虚拟模块与外部值(非 q-bundled fs) → 不变', async () => {
        const { changed, result } = await run({
            cc: 'q-bundled:///virtual/cc.js',
            'internal:constants': 'cce:/internal/x/constants',
        });
        expect(changed).toBe(false);
        expect(result['cc']).toBe('q-bundled:///virtual/cc.js');
        expect(result['internal:constants']).toBe('cce:/internal/x/constants');
    });

    it('混合场景：只改无扩展名且有源文件的项', async () => {
        const { result } = await run({
            'pal/system-info': 'q-bundled:///fs/pal/system-info/nodejs/system-info',
            'pal/system-info-typed': 'q-bundled:///fs/pal/system-info/nodejs/system-info.js',
            cc: 'q-bundled:///virtual/cc.js',
            'pal/missing': 'q-bundled:///fs/pal/does/not/exist',
        });
        expect(result['pal/system-info']).toBe('q-bundled:///fs/pal/system-info/nodejs/system-info.js');
        expect(result['pal/system-info-typed']).toBe('q-bundled:///fs/pal/system-info/nodejs/system-info.js');
        expect(result['cc']).toBe('q-bundled:///virtual/cc.js');
        expect(result['pal/missing']).toBe('q-bundled:///fs/pal/does/not/exist');
    });

    it('import-map 不存在 / 无 imports 字段 → 安全返回 false，不抛异常', async () => {
        await expect(fixImportMapExtensions(ps.join(engineRoot, 'no-such.json'), engineRoot)).resolves.toBe(false);
        const empty = ps.join(engineRoot, 'empty.json');
        await fsExtra.outputJson(empty, {});
        await expect(fixImportMapExtensions(empty, engineRoot)).resolves.toBe(false);
    });
});
