import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import { basename, join, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import ejs from 'ejs';
import { GlobalPaths } from '../../global';
import { scriptingRoutes } from './scripting-routes';
import { getCachedPreviewSettings, PreviewNotReadyError } from './preview-settings';
import { notePreviewNotReady } from './live-reload';
import { getPreviewToolbarOptions, setPreviewToolbarOption } from './preview-toolbar-options';
import i18n from '../base/i18n';

/**
 * 各资源数据库的 library（已导入数据）目录缓存。
 * 与编辑器 `queryOtherLibraryPath` 对齐：library 是扁平的 `<uuid前两位>/<uuid>.<ext>` 结构，
 * 一个相对路径在所有 library 目录中唯一定位文件，因此 url 中的 bundle 段可忽略。
 */
let libraryDirsCache: string[] | null = null;
export async function getLibraryDirs(): Promise<string[]> {
    if (libraryDirsCache) {
        return libraryDirsCache;
    }
    const { assetDBManager } = await import('../assets');
    const dirs = Object.values(assetDBManager.assetDBInfo)
        .map((info) => info.library)
        .filter((v) => !!v);
    libraryDirsCache = Array.from(new Set(dirs));
    return libraryDirsCache;
}

/**
 * 游戏运行时共享的资源路由（settings / 原始资源 / bundle config / bundle index / 启动场景 JSON）。
 * 浏览器游戏预览（/）使用；抽出为具名导出便于维护。
 */
export const gamePreviewResourceRoutes = [
    {
        // 运行时 settings：window._CCSettings = {...}
        url: '/preview/settings.js',
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const startScene = typeof req.query.scene === 'string' ? req.query.scene : '';
                const { settings } = await getCachedPreviewSettings(startScene);
                if (!settings) {
                    return next(new Error('Generate preview settings failed.'));
                }
                // 缩短启动屏时间，预览刷新更快
                if ((settings as any).splashScreen) {
                    (settings as any).splashScreen.totalTime = 50;
                }
                // settings 实时反映项目状态（启动场景 / jsList / 脚本映射），禁止缓存，
                // 否则浏览器会复用旧 settings，出现“幽灵”插件/场景等问题。
                res.set('Cache-Control', 'no-store');
                res.type('application/javascript').send(`window._CCSettings = ${JSON.stringify(settings)};`);
            } catch (err) {
                // 初始化未完成即请求预览：返回可重试的 503，让 IDE/浏览器稍后重试，
                // 而不是返回缺 builtinAssets 的坏 settings 或裸 500。
                if (err instanceof PreviewNotReadyError) {
                    console.info(`[preview-settings Warning] not ready, ask client to retry (scene=${req.query.scene ?? ''})`);
                    // 关键自愈触发点：确有预览页因未就绪而 boot 失败（settings.js 503）。据此标记待自愈，
                    // 待 settings 首次真正可用时由 live-reload 广播 browser:reload 把该页刷新救回，无需手动刷新。
                    // 以「确实发生过 503」为依据比依赖 socket 连接时序更可靠（规避异步就绪探测跨越初始化完成
                    // 边界、标记 healed 却漏广播的竞态）。
                    notePreviewNotReady();
                    res.set('Retry-After', '1');
                    return res.status(503).type('text/plain').send('// Preview initializing, please retry.');
                }
                // 其它异常：显式打印真实堆栈，否则会被 express 错误中间件吞成裸 500，
                // 表现为 "PhysicsSystem initDefaultMaterial Failed" / Graphics recompileShaders of null。
                console.error(`[preview-settings] settings.js generation FAILED (scene=${req.query.scene ?? ''}):`, err);
                next(err);
            }
        },
    },
    {
        // bundle 的原始资源文件（import / native），从 asset-db library 目录读取
        url: /^\/(?:remote|assets)\/[^/]+\/(?:import|native)\/(.*)/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const match = req.path.match(/^\/(?:remote|assets)\/[^/]+\/(?:import|native)\/(.*)/);
                if (!match) {
                    return next();
                }
                // 逐段 encode，兼容子资源 `@` 与含特殊字符的目录名（仅保留分隔符 / \ 与 @ 不编码）
                const tail = match[1].replace(/[^\\/@]+/g, encodeURIComponent);
                const dirs = await getLibraryDirs();
                // 防目录穿越：join 后必须仍位于 library 目录内，否则跳过（`..` 会逃逸出目录）
                let hit: string | undefined;
                for (const d of dirs) {
                    const full = join(d, tail);
                    const rel = relative(d, full);
                    if (rel.startsWith('..') || isAbsolute(rel)) {
                        continue;
                    }
                    if (existsSync(full)) {
                        hit = full;
                        break;
                    }
                }
                if (!hit) {
                    return next();
                }
                res.sendFile(hit, { dotfiles: 'allow' });
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // bundle 配置 config.json / cc.config.json
        url: /^\/(?:remote|assets)\/([^/]+)\/(?:config|cc\.config)\.json$/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const match = req.path.match(/^\/(?:remote|assets)\/([^/]+)\/(?:config|cc\.config)\.json$/);
                if (!match) {
                    return next();
                }
                const { bundleConfigs } = await getCachedPreviewSettings();
                const config = bundleConfigs.find((c) => c.name === match[1]);
                if (!config) {
                    return next();
                }
                res.status(200).json(config);
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // bundle 入口 index.js —— 预览下脚本由 QuickPack import-map 提供，这里只需一个空模块占位
        url: /^\/(?:remote|assets)\/([^/]+)\/index\.js$/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const match = req.path.match(/^\/(?:remote|assets)\/([^/]+)\/index\.js$/);
                if (!match) {
                    return next();
                }
                const name = match[1];
                const { bundleConfigs } = await getCachedPreviewSettings();
                if (!bundleConfigs.find((c) => c.name === name)) {
                    return next();
                }
                res.type('application/javascript').send(
                    `System.register("virtual:///prerequisite-imports/${name}", [], function () {` +
                    ` "use strict"; return { setters: [], execute: function () {} }; });`);
            } catch (err) {
                next(err);
            }
        },
    },
    {
        // 启动场景 JSON
        url: /^\/scene\/(.+)\.json$/,
        async handler(req: Request, res: Response, next: NextFunction) {
            try {
                const match = req.path.match(/^\/scene\/(.+)\.json$/);
                if (!match) {
                    return next();
                }
                let uuidOrUrl = match[1];
                try {
                    uuidOrUrl = decodeURIComponent(uuidOrUrl);
                } catch {
                    // ignore
                }
                const { assetManager } = await import('../assets');
                const info = assetManager.queryAssetInfo(uuidOrUrl);
                const file = info?.library?.['.json'];
                if (!file || !existsSync(file)) {
                    return next();
                }
                res.set('Cache-Control', 'no-store');
                res.sendFile(file, { dotfiles: 'allow' });
            } catch (err) {
                next(err);
            }
        },
    },
];

export default {
    get: [
        {
            // 游戏预览入口页面（浏览器游戏预览，PREVIEW 模式）
            url: '/',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const scene = typeof req.query.scene === 'string' ? req.query.scene : '';
                    const sceneQuery = scene ? `?scene=${encodeURIComponent(scene)}` : '';
                    // projectPath 可能在极早期（工程刚 open、scripting 尚未 initialize）为空——
                    // `/` 提前注册以避免初始化期兜底 404，此时用兜底标题渲染即可（页面本身只需能加载
                    // socket.io + browser:reload 监听，就绪后自愈刷新）。
                    const projectName = scripting.projectPath ? basename(scripting.projectPath) : 'Preview';
                    const renderData = {
                        title: `Cocos Creator - ${projectName}`,
                        serverURL: serverBaseUrl,
                        settingsJs: `/preview/settings.js${sceneQuery}`,
                        sceneQuery,
                        previewToolbarOptions: getPreviewToolbarOptions(),
                        // Keep the preview page aligned with Creator: localize device-mode names on the
                        // server, then inject the resolved values into the browser page. The toolbar
                        // itself does not need a second client-side i18n runtime.
                        previewToolbarI18n: {
                            device: {
                                designResolution: i18n.t('common.preview.device.design_resolution'),
                                fullScreen: i18n.t('common.preview.device.full_screen'),
                                webpageFullScreen: i18n.t('common.preview.device.webpage_full_screen'),
                            },
                        },
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'game.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    // 预览入口页不缓存，避免浏览器复用旧的 boot/settings 引用
                    res.set('Cache-Control', 'no-store');
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        // 游戏运行时共享资源路由
        ...gamePreviewResourceRoutes,
        // 共享的引擎 / 脚本 / SystemJS / import-map 等动态资源路由（含 /static/web）
        ...scriptingRoutes,
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (socket: any) => {
            // 对齐 Creator preview-app：工具栏通过同一个 socket 上报 changeOption，
            // 服务端保存会话状态，下一次页面渲染时重新注入。
            socket.on?.('changeOption', (name: unknown, value: unknown) => {
                setPreviewToolbarOption(name, value);
            });
        },
        disconnect: (_socket: any) => { },
    },
} as IMiddlewareContribution;
