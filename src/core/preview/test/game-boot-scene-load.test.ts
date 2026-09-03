/**
 * `static/web/game-boot.js`「场景加载失败必须 reject boot promise」的回归护栏。
 *
 * 背景（PR #906 review P1）：场景加载写在 `cc.game.run(async () => {...})` 的回调里，而引擎的
 * `game.run` 返回 void、fire-and-forget 该回调——回调内抛出的异常**不会**传播到 gameBoot 外层
 * try/catch。若 fetch 失败 / 响应非 JSON / 快照缺失（/scene/current.json 404），`rejectSceneRun`
 * 永不触发，`await sceneRunDone` 永远 pending：
 *  - IDE 预览（PinK previewMain 等 `await gameBoot()` 的消费方）卡在 loading，view:error 永不
 *    fire，错误浮层与重试都不可达；
 *  - 浏览器首屏表现为游戏停在 `cc.game.pause()` 之后、无任何报错。
 *
 * 该文件是有 import 的浏览器 ESM，无法像 preview-inspect 测试那样 new Function 求值执行，
 * 故这里对源码做结构断言：钉住「回调整体被 try/catch 收敛到 rejectSceneRun」「fetch 响应
 * 先查 ok 再 .json()」「外层 catch 仍 rethrow（IDE 感知失败的契约）」三条不变量。
 */

import * as fs from 'fs';
import * as path from 'path';

const GAME_BOOT_SOURCE_PATH = path.resolve(__dirname, '../../../../static/web/game-boot.js');

function loadSource(): string {
    return fs.readFileSync(GAME_BOOT_SOURCE_PATH, 'utf8');
}

/** 截取「场景加载入口 → await sceneRunDone;」之间的区段（带分号匹配真实代码行，避开注释里的同名词）。 */
function extractSceneRunSection(source: string): string {
    const start = source.indexOf('await cc.game.run(');
    const end = source.indexOf('await sceneRunDone;');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe('game-boot 场景加载失败路径（防 boot 挂死）', () => {
    const source = loadSource();
    const section = extractSceneRunSection(source);

    it('cc.game.run 回调的场景加载路径必须整体包在 try/catch 内，且 catch 收敛到 rejectSceneRun', () => {
        const tryIndex = section.indexOf('try {');
        const fetchIndex = section.indexOf('fetch(');
        const catchIndex = section.lastIndexOf('catch');
        expect(tryIndex).toBeGreaterThan(-1);
        expect(fetchIndex).toBeGreaterThan(tryIndex); // fetch 必须落在 try 之内
        expect(catchIndex).toBeGreaterThan(fetchIndex);
        // 最后一个 catch 块里必须调用 rejectSceneRun（而非只打日志）
        expect(section.slice(catchIndex)).toContain('rejectSceneRun(');
    });

    it('场景加载路径不允许「未检查 ok 的 fetch(...).json() 一行式」这一历史挂死写法', () => {
        // 仅约束 cc.game.run 回调内的场景加载段（fire-and-forget 上下文）；
        // 主流程里其他 await (await fetch(...)).json()（如 engine modules 查询）本身在
        // gameBoot 的 try/catch 内，失败会正常冒泡，不在此限。
        expect(section).not.toMatch(/await\s*\(\s*await\s+fetch\([^)]*\)\s*\)\.json\(\)/);
    });

    it('fetch 响应必须先做 ok/状态检查，非 2xx 时抛出可读错误', () => {
        expect(section).toMatch(/if\s*\(\s*!\s*\w+\.ok\s*\)/);
        expect(section).toContain('throw new Error(');
    });

    it('所有失败出口（loadWithJson 错误 / runSceneImmediate 抛出 / 回调外层捕获）都收敛到 rejectSceneRun', () => {
        const rejects = section.match(/rejectSceneRun\(/g) || [];
        expect(rejects.length).toBeGreaterThanOrEqual(3);
        // 失败时都要在预览面上可见：每个 reject 附近都有 showError
        const showErrors = section.match(/showError\(/g) || [];
        expect(showErrors.length).toBeGreaterThanOrEqual(3);
    });

    it('sceneRunDone 的 reject 必须能传播到 gameBoot 外层 catch 并 rethrow（IDE 预览的失败感知契约）', () => {
        // await sceneRunDone 必须位于外层 try 内（其后存在统一 catch + rethrow）
        const awaitDone = source.indexOf('await sceneRunDone');
        const outerCatch = source.indexOf('Failed to start game preview');
        expect(awaitDone).toBeGreaterThan(-1);
        expect(outerCatch).toBeGreaterThan(awaitDone);
        const tail = source.slice(outerCatch);
        expect(tail).toContain('showError(err)');
        expect(tail).toMatch(/throw\s+err\s*;/);
    });
});
