/**
 * `lib/simulator` 的**接口冻结检查**。
 *
 * Pink 侧的 `handle` 是无白名单的通用转发：这个模块的每一个导出函数都自动成为公开 API，
 * 接入之后再删就是跨仓库 break。所以这里把导出名逐字锁死 —— 加一个内部辅助函数、
 * 或者改一个名字，都必须先改这张表，顺手就会意识到那是协议变更。
 *
 * 对应设计文档 `docs/simulator-pink-interface.md` 第 4 节的表格。
 */

import * as Simulator from '../src/lib/simulator/simulator';

/** 与设计文档第 4 节逐行对应。改这里之前先确认 Pink 侧能接受。 */
const FROZEN_EXPORTS = [
    // 生命周期
    'init',
    // 构建
    'build',
    'buildNative',
    'buildRuntime',
    'isBuilt',
    // 路径推导
    'getManifest',
    'getExecutablePath',
    'getResourcesPath',
    'getWritablePath',
    // 运行
    'prepareResources',
    'launchPreview',
    'start',
    'stop',
    'stopAll',
    'getStatus',
    'listSessions',
    // 事件
    'onDidChangeSession',
    'onLog',
    'onDidChangeBuildState',
] as const;

describe('lib/simulator 接口冻结', () => {
    const exportNames = Object.keys(Simulator).filter((name) => typeof (Simulator as Record<string, unknown>)[name] === 'function');

    it('导出名集合与设计文档完全一致', () => {
        expect(exportNames.slice().sort()).toEqual(FROZEN_EXPORTS.slice().sort());
    });

    it('三个事件同步返回反订阅函数（Pink 的 init 里拿不到 await）', () => {
        for (const name of ['onDidChangeSession', 'onLog', 'onDidChangeBuildState'] as const) {
            const dispose = Simulator[name](() => { /* noop */ });
            expect(typeof dispose).toBe('function');
            dispose();
        }
    });

    it('不再导出已删除的 isAvailable / restart', () => {
        // isAvailable 是 isBuilt 的纯别名；restart 由「先停后起」的 launchPreview 取代。
        expect(exportNames).not.toContain('isAvailable');
        expect(exportNames).not.toContain('restart');
    });
});
