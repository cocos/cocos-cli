import { scanPreviewExtensions } from './scanner';
import { MessageBus } from './message-bus';
import { ProfileStore } from './profile-store';
import { installEditorShim } from './editor-shim';
import { loadExtensionMain, loadExtensionServer } from './extension-loader';
import { buildMiddlewareContribution } from './server-registrar';

export interface ExtensionPreviewHost {
    /** 已成功加载（提供 server 路由）的扩展名 */
    extensions: string[];
    dispose(): void;
}

/**
 * 通用扩展预览宿主：在 CLI 预览服务器里加载并运行项目扩展自带的 backend 代码
 * （contributions.server 路由 + contributions.messages 处理函数），背后用 Node 侧
 * Editor.* 垫片支撑，对齐 Cocos Creator 编辑器托管扩展的行为。
 *
 * 必须在 register('GamePreview', ...) 之前调用，使扩展的具体路由先于
 * scriptingRoutes 里的宽泛正则注册、从而优先命中。
 */
export async function loadExtensionPreviewHost(projectPath: string): Promise<ExtensionPreviewHost> {
    const exts = scanPreviewExtensions(projectPath);
    if (!exts.length) {
        return { extensions: [], dispose() { /* no-op */ } };
    }

    const bus = new MessageBus();
    const profileStore = new ProfileStore(projectPath);
    // 先装垫片：扩展 bundle 在模块求值期就会访问 Editor.Project.path
    installEditorShim({ projectPath, bus, profileStore });

    // 1) 先加载所有扩展主进程（注册消息处理 + 各自 load 初始化）
    const loadedMains = new Set<string>();
    for (const ext of exts) {
        const main = await loadExtensionMain(ext, bus);
        if (main !== undefined) {
            loadedMains.add(ext.name);
        }
    }

    // 2) 再加载 server 贡献（其路由处理器会经 Editor.Message 回调主进程）
    const routeSets: { get?: any[]; post?: any[] }[] = [];
    const loaded: string[] = [];
    for (const ext of exts) {
        // messages 依赖 Preview main 提供处理函数；主进程未加载成功时，不能暴露
        // 仍会回调失效 Editor.Message 的 server 路由。无 messages 的 server-only 扩展
        // 保持原有行为，即使没有 main 也照常加载其路由。
        if (Object.keys(ext.messages).length > 0 && !loadedMains.has(ext.name)) {
            console.warn(`[ExtensionHost] skip preview routes for '${ext.name}': preview main failed to load`);
            continue;
        }
        const routes = loadExtensionServer(ext);
        if (routes && ((routes.get && routes.get.length) || (routes.post && routes.post.length))) {
            routeSets.push(routes);
            loaded.push(ext.name);
        }
    }

    if (routeSets.length) {
        try {
            const contribution = buildMiddlewareContribution(routeSets);
            const { middlewareService } = await import('../../../server/middleware');
            middlewareService.register('ExtensionPreview', contribution);
            console.log(`[ExtensionHost] registered preview routes from: ${loaded.join(', ')}`);
        } catch (err) {
            console.warn('[ExtensionHost] failed to register extension preview routes:', err);
        }
    }

    let disposed = false;
    return {
        extensions: loaded,
        // 同一预览会话内 dispose 可能由多个关闭路径触发；扩展 unload 只允许执行一次。
        // middlewareService 的路由注销仍由现有生命周期限制负责，本函数不扩大其能力。
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            // 对齐 Creator 的扩展生命周期：销毁时调用各扩展自身的 unload()
            for (const { name, mainModule } of bus.getRegisteredMains()) {
                try {
                    if (typeof mainModule?.unload === 'function') {
                        const pending = mainModule.unload();
                        if (pending && typeof pending.then === 'function') {
                            void pending.catch((err: unknown) => {
                                console.warn(`[ExtensionHost] unload '${name}' failed:`, err);
                            });
                        }
                    }
                } catch (err) {
                    console.warn(`[ExtensionHost] unload '${name}' failed:`, err);
                }
            }
        },
    };
}
