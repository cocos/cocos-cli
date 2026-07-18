import { watch, FSWatcher } from 'fs';
import { ensureDirSync } from 'fs-extra';
import { join } from 'path';
import { socketService } from '../../server/socket';
import { invalidatePreviewSettings } from './preview-settings';

/**
 * 浏览器热重载。
 *
 * 对齐编辑器：脚本重编译完成或资源刷新结束后，通过 socket.io 广播 `browser:reload`，
 * 浏览器端收到后整页刷新。先清空预览 settings 缓存，保证刷新后取到最新数据。
 *
 * 注意：cocos-cli 没有逐资源级别的变更事件，`assets:refresh-finish` 是整批刷新结束的
 * 粗粒度信号，对整页刷新已足够。
 */
let timer: NodeJS.Timeout | null = null;
let registered = false;
// 保存已注册的监听源与回调，供 unregisterLiveReload 精确解绑，避免预览重启后监听泄漏。
let scriptingRef: { off?: Function; removeListener?: Function } | null = null;
let assetDBRef: { off?: Function; removeListener?: Function } | null = null;
let configRef: { off?: Function; removeListener?: Function } | null = null;
let onCompiled: (() => void) | null = null;
let onRefreshFinish: (() => void) | null = null;
let onConfigChanged: (() => void) | null = null;
// pack 产物目录监听：感知本进程或外部进程（如 Creator）对共用 temp/packer-driver 的重编。
let packWatcher: FSWatcher | null = null;
let packTimer: NodeJS.Timeout | null = null;

function removeListener(emitter: { off?: Function; removeListener?: Function } | null, event: string, fn: Function | null): void {
    if (!emitter || !fn) {
        return;
    }
    const off = emitter.off || emitter.removeListener;
    off?.call(emitter, event, fn);
}

function scheduleReload(): void {
    invalidatePreviewSettings();
    if (timer) {
        clearTimeout(timer);
    }
    // 去抖：编译/刷新可能短时间内多次触发，合并成一次刷新
    timer = setTimeout(() => {
        timer = null;
        socketService.io?.emit('browser:reload');
    }, 200);
}

/**
 * 主动触发一次浏览器热重载（去抖）。
 * 供扩展宿主映射 Creator 的预览刷新信号（preview/reload-terminal、scene/soft-reload）使用。
 */
export function triggerPreviewReload(): void {
    scheduleReload();
}

/**
 * pack 产物（import-map / chunk）变化后：先刷新 cli 内存态 QuickPackLoader（读到磁盘最新映射），
 * 再触发浏览器整页刷新，取到一致的 import-map + chunk。去抖，避免一次编译的多次写入触发多次刷新。
 */
function schedulePackReload(): void {
    if (packTimer) {
        clearTimeout(packTimer);
    }
    packTimer = setTimeout(async () => {
        packTimer = null;
        try {
            const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
            const facet = await waitForProgrammingFacet();
            // 重载内存 loader：感知 Creator 等外部进程对共用 temp/packer-driver 的重编，
            // 避免 cli 仍用旧 import-map 引用已被删除的 chunk 哈希 → 浏览器 chunk 404（SystemJS Error#3）。
            await facet.notifyPackDriverUpdated();
        } catch (e) {
            console.warn('[Live Reload] refresh pack loader failed:', e);
        }
        scheduleReload();
    }, 300);
}

/**
 * 注册热重载监听。仅生效一次。
 */
export async function registerLiveReload(): Promise<void> {
    if (registered) {
        return;
    }
    registered = true;

    const { default: scripting } = await import('../scripting');
    const { assetDBManager } = await import('../assets');
    const { configurationManager } = await import('../configuration');
    const { MessageType } = await import('../configuration/script/interface');

    onCompiled = () => scheduleReload();
    onRefreshFinish = () => scheduleReload();
    // 工程配置变更（如切换物理后端 = 改 engine.includeModules）会影响预览 settings，
    // 需清缓存并重载，否则预览仍用旧模块集（漏掉新后端的内置资源，报 builtinMaterial 加载失败）。
    onConfigChanged = () => scheduleReload();
    scriptingRef = scripting as any;
    assetDBRef = assetDBManager as any;
    configRef = configurationManager as any;

    // 脚本重编译成功
    scripting.on('compiled', onCompiled);
    // 资源批量刷新结束
    assetDBManager.on('assets:refresh-finish', onRefreshFinish);
    // 工程配置变更（set / reload）
    configurationManager.on(MessageType.Update, onConfigChanged);
    configurationManager.on(MessageType.Reload, onConfigChanged);

    // 监听 pack 产物目录：脚本被本进程或外部进程（如 Creator，共用 temp/programming/packer-driver）
    // 重编时，import-map / chunk 会变化。此时刷新 cli 内存态 loader 并触发浏览器刷新，
    // 解决「Creator 与 cli 同开一个项目、Creator 重编后 cli 仍用旧 import-map → chunk 404」。
    try {
        const packDir = join(scripting.projectPath, 'temp', 'programming', 'packer-driver');
        ensureDirSync(packDir);
        // recursive 在 Windows/macOS 支持；Linux 不支持会抛错，降级为不监听（config/compiled 事件仍覆盖本进程改动）。
        packWatcher = watch(packDir, { recursive: true }, (_event, filename) => {
            if (!filename) {
                return;
            }
            const name = filename.toString();
            // 只在编译结束信号（import-map / resolution-detail-map 重写）时刷新，忽略 chunks 写入噪声。
            if (name.endsWith('import-map.json') || name.endsWith('resolution-detail-map.json')) {
                schedulePackReload();
            }
        });
    } catch (e) {
        console.warn('[Live Reload] watch packer-driver dir failed (pack hot-refresh disabled):', e);
    }
}

/**
 * 注销热重载监听并清理去抖定时器。预览关闭时调用，避免同进程内重启预览时监听/定时器泄漏。
 */
export function unregisterLiveReload(): void {
    if (!registered) {
        return;
    }
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (packTimer) {
        clearTimeout(packTimer);
        packTimer = null;
    }
    if (packWatcher) {
        packWatcher.close();
        packWatcher = null;
    }
    removeListener(scriptingRef, 'compiled', onCompiled);
    removeListener(assetDBRef, 'assets:refresh-finish', onRefreshFinish);
    // MessageType.Update / MessageType.Reload
    removeListener(configRef, 'configuration:update', onConfigChanged);
    removeListener(configRef, 'configuration:reload', onConfigChanged);
    scriptingRef = null;
    assetDBRef = null;
    configRef = null;
    onCompiled = null;
    onRefreshFinish = null;
    onConfigChanged = null;
    registered = false;
}
