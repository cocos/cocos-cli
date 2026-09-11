/**
 * Simulator 对外命令层。
 *
 * 这份导出列表**就是**协议：Pink 侧的 `handle` 是无白名单的通用转发，每一个导出函数都自动
 * 成为公开 API，接入之后再删就是跨仓库 break。改动前请先看
 *
 * - 入参 / 返回值只能是 JSON 值 —— 不能出现函数、class 实例、`Map` / `Set` / `Date`；
 * - 事件只能写成 `onXxx(listener): () => void`，Pink 在 init 里订阅并转发；
 * - 导出的 `init` 会被基类自动调用。
 *
 * `core/simulator` 用静态 import 而非惰性 `await import`：三个 `onXxx` 必须同步返回反订阅
 * 函数，拿不到 await 的机会。与 `lib/assets` / `lib/scripting` 一致。
 */

import { simulatorManager } from '../../core/simulator';

export type {
    ISimulatorBuildState,
    ISimulatorLaunchPreviewOptions,
    ISimulatorLaunchPreviewResult,
    ISimulatorLogEntry,
    ISimulatorManifest,
    ISimulatorPreparedResources,
    ISimulatorPrepareOptions,
    ISimulatorResolution,
    ISimulatorSessionInfo,
    ISimulatorStartOptions,
} from '../../core/simulator';

import type {
    ISimulatorBuildState,
    ISimulatorLaunchPreviewOptions,
    ISimulatorLaunchPreviewResult,
    ISimulatorLogEntry,
    ISimulatorManifest,
    ISimulatorPreparedResources,
    ISimulatorPrepareOptions,
    ISimulatorSessionInfo,
    ISimulatorStartOptions,
} from '../../core/simulator';

/**
 * 记下当前工程路径，作为 `prepareResources` / `launchPreview` 的 `projectPath` 默认值。
 *
 * 宿主会自动调用（Pink 的 cocosHost 基类在加载模块后 `await mod.init(...args)`）。
 * `enginePath` 不需要传：内部兜底到 `GlobalPaths.enginePath`，即 `--cocos-path` 下的
 * `packages/engine`。
 */
export async function init(projectPath: string): Promise<void> {
    return simulatorManager.init(projectPath);
}

/** 构建 native 可执行程序 + runtime TS 产物。并发调用会合并成一次。 */
export async function build(enginePath?: string): Promise<void> {
    return simulatorManager.build(enginePath);
}

/** 构建 native 可执行程序（`workflow/build-simulator.js`）。 */
export async function buildNative(enginePath?: string): Promise<void> {
    return simulatorManager.buildNative(enginePath);
}

/**
 * 构建 simulator 的 runtime TS 产物（`workflow/build-simulator-runtime.js`）。
 * 对应 editor 的 `build-simulator-engine-ts` message。
 */
export async function buildRuntime(enginePath?: string): Promise<void> {
    return simulatorManager.buildRuntime(enginePath);
}

/** native 可执行程序是否已构建且匹配当前宿主平台。 */
export async function isBuilt(enginePath?: string): Promise<boolean> {
    return simulatorManager.isBuilt(enginePath);
}

/** 当前宿主平台的产物信息（bundle / entry / 构建时间）；平台不支持时返回 `null`。 */
export async function getManifest(enginePath?: string): Promise<ISimulatorManifest | null> {
    return simulatorManager.getManifest(enginePath);
}

/** native 可执行文件的绝对路径；尚未构建时返回 `null`。 */
export async function getExecutablePath(enginePath?: string): Promise<string | null> {
    return simulatorManager.getExecutablePath(enginePath);
}

/** runtime 产物默认落点（macOS 是 app bundle 的 `Contents/Resources`，Windows 是 `Release/`）。 */
export async function getResourcesPath(enginePath?: string): Promise<string> {
    return simulatorManager.getResourcesPath(enginePath);
}

/** native 侧 `-writable-path`（Windows 上是 `%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime`）。 */
export async function getWritablePath(enginePath?: string): Promise<string> {
    return simulatorManager.getWritablePath(enginePath);
}

/**
 * 往 runtime 目录写好 settings / bundle 索引 / 引擎产物 / `config.json`。
 * 对应 editor 的 `write-setting-file` message（cocos-cli 这份是超集）。
 *
 * 同一个输出目录上的并发调用会合并成一次。
 */
export async function prepareResources(options: ISimulatorPrepareOptions = {}): Promise<ISimulatorPreparedResources> {
    return simulatorManager.prepareResources(options);
}

/**
 * 起预览：preview server → `prepareResources` → 启动 simulator。
 *
 * **先停后起**，所以它同时也是「重启」入口 —— 对应 editor 的 `open-terminal`
 * 与 `restart-simulator` 两个 message，后者的实现就是再调一次 `runSimulator()`。
 * 改分辨率 / 屏幕方向直接带新参数再调一次即可。
 */
export async function launchPreview(options: ISimulatorLaunchPreviewOptions = {}): Promise<ISimulatorLaunchPreviewResult> {
    return simulatorManager.launchPreview(options);
}

/**
 * 底层启动接口：不碰 preview server、不准备资源，直接 spawn 一个会话。
 * 与 {@link launchPreview} 不同，它**不会**停掉已有会话，可以并存多个。
 */
export async function start(options: ISimulatorStartOptions): Promise<ISimulatorSessionInfo> {
    return simulatorManager.start(options);
}

/** 停掉指定会话；会话不存在或已停返回 `false`。 */
export async function stop(id: string): Promise<boolean> {
    return simulatorManager.stop(id);
}

/** 停掉所有还在跑的会话，返回实际停掉的个数。关工程 / 切工程时应当调用。 */
export async function stopAll(): Promise<number> {
    return simulatorManager.stopAll();
}

/** 查会话状态；不存在返回 `null`。 */
export async function getStatus(id: string): Promise<ISimulatorSessionInfo | null> {
    return simulatorManager.getStatus(id);
}

/** 列出全部会话（含已停止的）。 */
export async function listSessions(): Promise<ISimulatorSessionInfo[]> {
    return simulatorManager.listSessions();
}

/**
 * 会话状态变化：启动、首次出输出（`readyAt`）、退出、启动失败、被 stop 各一次。
 *
 * 对应 editor 的 `simulatorProcess.on('close')` 与 `runSimulator(onCompleted)` 回调。
 * 用 `status` / `readyAt` / `exitCode` / `signal` 区分具体情形。
 *
 * @returns 反订阅函数
 */
export function onDidChangeSession(listener: (session: ISimulatorSessionInfo) => void): () => void {
    return simulatorManager.onDidChangeSession(listener);
}

/**
 * simulator 进程与构建脚本的逐行输出。
 *
 * 对应 editor 把 stdout / stderr 直接 `console.log` / `console.error` 的行为。
 * simulator 的 JS 报错和 `cc.log` 都走这里，是主要调试通道。
 *
 * @returns 反订阅函数
 */
export function onLog(listener: (entry: ISimulatorLogEntry) => void): () => void {
    return simulatorManager.onLog(listener);
}

/**
 * 构建阶段状态：start / success / failed，**不带百分比**（逐行输出走 {@link onLog}）。
 * 对应 editor 的 `programming:compile-start` / `programming:compiled` 广播。
 *
 * @returns 反订阅函数
 */
export function onDidChangeBuildState(listener: (state: ISimulatorBuildState) => void): () => void {
    return simulatorManager.onDidChangeBuildState(listener);
}
