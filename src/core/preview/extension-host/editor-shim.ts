import { compressUUID, decompressUUID } from '../../base/utils/uuid';
import { ensureEditorProjectPath } from '../../base/editor-shim';
import { MessageBus } from './message-bus';
import { ProfileStore } from './profile-store';

export interface EditorShimContext {
    projectPath: string;
    bus: MessageBus;
    profileStore: ProfileStore;
}

/**
 * 安装 Node 侧的 `global.Editor` 垫片，供项目扩展的主进程/server 代码在 CLI 里运行。
 * 仅覆盖扩展实际用到的子集（以 localization-editor 为基准），随需增长。
 * 同一会话单例：重复安装只刷新 Project.path。
 *
 * 必须在 require 任何扩展模块之前安装：扩展 bundle 在模块求值期就会访问 Editor.Project.path。
 */
export function installEditorShim(ctx: EditorShimContext): void {
    const g = globalThis as any;
    if (g.Editor && g.Editor.__cliExtensionHost) {
        ensureEditorProjectPath(ctx.projectPath);
        return;
    }
    g.Editor = {
        __cliExtensionHost: true,
        Project: {},
        Message: {
            request: (domain: string, message: string, ...args: any[]) => ctx.bus.dispatch(domain, message, ...args),
            send: (domain: string, message: string, ...args: any[]) => { void ctx.bus.dispatch(domain, message, ...args); },
            broadcast: () => { /* no-op */ },
        },
        Profile: {
            getProject: ctx.profileStore.getProject,
            setProject: ctx.profileStore.setProject,
            removeProject: ctx.profileStore.removeProject,
            getConfig: ctx.profileStore.getConfig,
            setConfig: ctx.profileStore.setConfig,
            removeConfig: ctx.profileStore.removeConfig,
        },
        I18n: { t: (key: string) => key },
        Utils: {
            UUID: {
                compressUUID: (uuid: string, min?: boolean) => compressUUID(uuid, !!min),
                decompressUUID: (uuid: string) => decompressUUID(uuid),
            },
        },
        Metrics: { trackEvent: () => { /* no-op */ } },
        Panel: { open: () => { /* no-op */ }, close: () => { /* no-op */ } },
    };
    ensureEditorProjectPath(ctx.projectPath);
}
