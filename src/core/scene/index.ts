import i18n from '../base/i18n';
import { sceneConfigInstance } from './scene-configs';
// 接口类型
export * from './common';
// 主进程
export * from './main-process';
export { sceneConfigInstance };

import { middlewareService } from '../../server/middleware';
import SceneMiddleware from './scene.middleware';
import SceneScriptingMiddleware from './scene.scripting.middleware';

const i18nModules: Record<string, () => Promise<any>> = {
    zh: () => import('./i18n/zh'),
    en: () => import('./i18n/en'),
};

export async function loadSceneI18n() {
    for (const [lang, loader] of Object.entries(i18nModules)) {
        try {
            const data = await loader();
            i18n.registerLanguagePatch(lang, 'scene', data.default || data);
        } catch (error) {
            console.warn(`[Scene] Failed to load scene i18n for ${lang}:`, error);
        }
    }
}

// 场景配置初始化
export async function init() {
    await loadSceneI18n();

    // 统一注册浏览器游戏预览路由（扩展预览后端 + GamePreview + 热重载），必须在 SceneScripting /
    // Scene 之前，使 / 及资源路由优先于场景中间件的宽泛路由。放在 scene init 里，保证所有走
    // startup / startupScene 的调用方（含其它 IDE 集成）都得到一致的“场景编辑器 + 浏览器预览”行为。
    const { default: scripting } = await import('../scripting');
    const { registerBrowserPreview } = await import('../preview/register');
    await registerBrowserPreview(scripting.projectPath);

    middlewareService.register('SceneScripting', SceneScriptingMiddleware);
    middlewareService.register('Scene', SceneMiddleware);
    await sceneConfigInstance.init();
    await watchDesignResolutionChange();
    await watchCollisionGroupsChange();
}

let _designResolutionWatched = false;
/**
 * 监听工程设计分辨率变更，推送到浏览器场景刷新 cc.view。
 *
 * web 预览下场景跑在浏览器，主进程无法通过 RPC 反向调用浏览器 service（浏览器是 setWebTransport 客户端、
 * 未 register(Service)）。因此改用 socket.io（live-reload 同款的 server→browser 通道）通知浏览器调用
 * 它自己的 Engine.syncDesignResolution —— 等价于 Rpc.request('Engine','syncDesignResolution',[])。
 * 对齐 cocos-editor 的 project:change-design-resolution 推送。
 */
async function watchDesignResolutionChange() {
    if (_designResolutionWatched) {
        return;
    }
    _designResolutionWatched = true;
    const { configurationManager } = await import('../configuration');
    const { MessageType } = await import('../configuration/script/interface');
    const { socketService } = await import('../../server/socket');
    const { Rpc } = await import('./main-process/rpc');
    const push = () => {
        socketService.io?.emit('scene:invoke', { module: 'Engine', method: 'syncDesignResolution', args: [] });
        if (Rpc.isConnect()) {
            void Rpc.request('Engine', 'syncDesignResolution', []).catch((error) => {
                console.debug('[Scene] syncDesignResolution failed:', error);
            });
        }
    };
    // 进程内变更（PinK/调用方走 cli 配置系统 set/reload 时触发）
    configurationManager.on(MessageType.Update, (key: string) => {
        if (typeof key === 'string' && (key === 'engine' || key.startsWith('engine.designResolution'))) {
            push();
        }
    });
    configurationManager.on(MessageType.Reload, () => push());
}

let _collisionGroupsWatched = false;
/**
 * 监听工程物理碰撞分组变更，运行时重建引擎 PhysicsGroup 枚举并刷新属性面板。
 *
 * 分组只在引擎初始化时读取一次生成枚举，改配置后不重建就要重启 IDE（属性面板 Group 下拉的 enumList
 * 来自该枚举）。这里对齐 cocos-editor 的 project:update-physics-group：把最新分组通过 socket.io
 * scene:invoke 通道推给场景 webview 的 Engine.updatePhysicsGroup（属性面板的 node:change 来自该 webview，
 * 与设计分辨率同款通道），无需经主进程 / 子进程 RPC，也不对外暴露到 MCP。
 */
async function watchCollisionGroupsChange() {
    if (_collisionGroupsWatched) {
        return;
    }
    _collisionGroupsWatched = true;
    const { configurationManager } = await import('../configuration');
    const { MessageType } = await import('../configuration/script/interface');
    const { socketService } = await import('../../server/socket');
    const fse = await import('fs-extra');
    // 读磁盘 cocos.config.json（配置真相源）取最新分组。返回 null 表示磁盘上没有该配置/读失败，
    // 以便与「真的空数组（分组被全部删除）」区分。
    // 不用 configurationManager.get：reload() 的 load() 不会把新值同步回已注册的配置实例，get() 会拿到旧值。
    const readGroupsFromDisk = async (): Promise<{ index: number; name: string }[] | null> => {
        try {
            const configPath = await configurationManager.getConfigPath();
            if (await fse.pathExists(configPath)) {
                const json = await fse.readJSON(configPath);
                const disk = json?.engine?.physicsConfig?.collisionGroups;
                if (Array.isArray(disk)) {
                    return disk;
                }
            }
        } catch (error) {
            console.debug('[Scene] read collisionGroups from disk failed:', error);
        }
        return null;
    };
    const push = (groups: { index: number; name: string }[], source: string) => {
        console.log(`[Scene] physics collisionGroups changed, updating engine enum (${groups.length} groups, source=${source})`);
        // 通过 socket.io 通知浏览器场景页（scene webview）重建 PhysicsGroup 枚举并刷新属性面板。
        // 属性面板的 node:change 来自场景 webview，故只需推给 webview，无需经主进程/子进程 RPC。
        socketService.io?.emit('scene:invoke', { module: 'Engine', method: 'updatePhysicsGroup', args: [groups] });
    };

    // 从事件 payload 中提取分组数组，兼容多种保存粒度：
    //   - 精确子键：value 直接是数组
    //   - 整体保存 physicsConfig：value.collisionGroups
    //   - 整体保存 engine / Reload 的 projectConfig：value.(engine.)physicsConfig.collisionGroups
    const extractGroups = (raw: any): { index: number; name: string }[] | undefined => {
        if (Array.isArray(raw)) {
            return raw;
        }
        if (raw && typeof raw === 'object') {
            if (Array.isArray(raw.collisionGroups)) {
                return raw.collisionGroups;
            }
            if (Array.isArray(raw.physicsConfig?.collisionGroups)) {
                return raw.physicsConfig.collisionGroups;
            }
            if (Array.isArray(raw.engine?.physicsConfig?.collisionGroups)) {
                return raw.engine.physicsConfig.collisionGroups;
            }
        }
        return undefined;
    };

    // 防抖合并：连续增删多个分组时，只在操作停止 400ms 后统一处理一次，读取「最终」分组状态并刷新一次，
    // 从根上消除逐次事件因数据/刷新时序错位造成的“差一步”（连加只更新一个 / 删除残留一个）。
    let debounceTimer: NodeJS.Timeout | null = null;
    let latestPayload: { index: number; name: string }[] | undefined;
    const flush = async () => {
        debounceTimer = null;
        const payload = latestPayload;
        latestPayload = undefined;
        // 优先用已落定的磁盘真相（能表达“全部删除=空数组”）；磁盘无此配置时退回最近一次事件 payload
        const disk = await readGroupsFromDisk();
        const groups = disk ?? payload ?? [];
        push(groups, disk ? 'disk' : (payload ? 'payload' : 'empty'));
    };
    const schedule = (payloadGroups?: { index: number; name: string }[]) => {
        if (payloadGroups) {
            latestPayload = payloadGroups;
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => void flush(), 400);
    };

    configurationManager.on(MessageType.Update, (key: string, value: any) => {
        // 兼容精确子键（engine.physicsConfig.collisionGroups）与整体保存（engine.physicsConfig / engine）
        if (typeof key === 'string' && (key.startsWith('engine.physicsConfig') || key === 'engine')) {
            schedule(extractGroups(value));
        }
    });
    configurationManager.on(MessageType.Reload, (projectConfig: any) => schedule(extractGroups(projectConfig)));
}

/**
 * 启动场景
 * @param enginePath 引擎目录
 * @param projectPath 项目目录
 */
export async function startupScene(enginePath: string, projectPath: string) {
    await init();
    // 启动场景进程
    const { sceneWorker } = await import('./main-process/scene-worker');
    await sceneWorker.start(enginePath, projectPath);
}
