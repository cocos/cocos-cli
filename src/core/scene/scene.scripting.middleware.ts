import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import { basename, isAbsolute, join, relative } from 'path';
import { existsSync } from 'fs';
import ejs from 'ejs';
import { GlobalPaths } from '../../global';
import { scriptingRoutes } from '../preview/scripting-routes';
import { pathExists } from 'fs-extra';

export default {
    get: [
        {
            // 场景编辑器预览入口（编辑器 realm）。挂在 /scene-editor/，与浏览器游戏预览的 / 区分。
            url: /^\/scene-editor\/?$/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    // 无尾斜杠时重定向到带斜杠，保证页面相对路径解析一致
                    if (!req.path.endsWith('/')) {
                        return res.redirect(302, '/scene-editor/');
                    }
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const renderData = {
                        title: `Cocos Creator Preview - ${basename(scripting.projectPath)}`,
                        serverURL: serverBaseUrl
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'scene-editor.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/scene-editor/settings.json',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { getCachedSceneEditorSettings } = await import('../preview/preview-settings');
                    const result = await getCachedSceneEditorSettings();
                    res.set('Cache-Control', 'no-store');
                    res.status(200).json({
                        settings: result.settings,
                        bundleConfigs: result.bundleConfigs,
                    });
                } catch (err) {
                    const { PreviewNotReadyError } = await import('../preview/preview-settings');
                    if (err instanceof PreviewNotReadyError) {
                        res.set('Retry-After', '1');
                        return res.status(503).json({ error: 'Preview settings are not ready.' });
                    }
                    next(err);
                }
            },
        },
        {
            url: /^\/scene-editor\/assets\/([^/]+)\/(?:config|cc\.config)\.json$/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const match = req.path.match(/^\/scene-editor\/assets\/([^/]+)\/(?:config|cc\.config)\.json$/);
                    if (!match) {
                        return next();
                    }
                    const { getCachedSceneEditorSettings } = await import('../preview/preview-settings');
                    const settings = await getCachedSceneEditorSettings();
                    const config = settings.bundleConfigs.find((item: any) => item.name === match[1]);
                    if (!config) {
                        return next();
                    }
                    res.set('Cache-Control', 'no-store');
                    res.status(200).json(config);
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: /^\/scene-editor\/assets\/([^/]+)\/index\.js$/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const match = req.path.match(/^\/scene-editor\/assets\/([^/]+)\/index\.js$/);
                    if (!match) {
                        return next();
                    }
                    const { getCachedSceneEditorSettings } = await import('../preview/preview-settings');
                    const settings = await getCachedSceneEditorSettings();
                    if (!settings.bundleConfigs.find((item: any) => item.name === match[1])) {
                        return next();
                    }
                    res.type('application/javascript').send(
                        `System.register("virtual:///prerequisite-imports/${match[1]}", [], function () {` +
                        ` "use strict"; return { setters: [], execute: function () {} }; });`);
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: /^\/scene-editor\/assets\/[^/]+\/(?:import|native)\/(.*)/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const match = req.path.match(/^\/scene-editor\/assets\/[^/]+\/(?:import|native)\/(.*)/);
                    if (!match) {
                        return next();
                    }
                    const filePath = await resolveSceneEditorLibraryFile(match[1]);
                    if (!filePath) {
                        return next();
                    }
                    res.sendFile(filePath, { dotfiles: 'allow' });
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/preview',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const renderData = {
                        title: `Resource Preview - ${basename(scripting.projectPath)}`,
                        serverURL: serverBaseUrl
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'preview.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/scripting/effect-settings',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const effectBinPath = join(scripting.projectPath, 'temp', 'cli', 'asset-db', 'effect', 'effect.bin');
                    if (await pathExists(effectBinPath)) {
                        res.setHeader('Content-Type', 'application/octet-stream');
                        res.sendFile(effectBinPath);
                    } else {
                        res.status(404).send('effect.bin not found');
                    }
                } catch (err) {
                    next(err);
                }
            },
        },
        // 共享的引擎 / 脚本 / SystemJS / import-map 等动态资源路由
        ...scriptingRoutes,
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (_socket: any) => { },
        disconnect: (_socket: any) => { }
    },
} as IMiddlewareContribution;

let sceneEditorLibraryDirsCache: string[] | null = null;

async function getSceneEditorLibraryDirs(): Promise<string[]> {
    if (sceneEditorLibraryDirsCache) {
        return sceneEditorLibraryDirsCache;
    }
    const { assetDBManager } = await import('../assets');
    const dirs = Object.values(assetDBManager.assetDBInfo)
        .map((info: any) => info.library)
        .filter((item): item is string => !!item);
    sceneEditorLibraryDirsCache = Array.from(new Set(dirs));
    return sceneEditorLibraryDirsCache;
}

async function resolveSceneEditorLibraryFile(tail: string): Promise<string | undefined> {
    const encodedTail = tail.replace(/[^\\/@]+/g, encodeURIComponent);
    const dirs = await getSceneEditorLibraryDirs();
    for (const dir of dirs) {
        const full = join(dir, encodedTail);
        const rel = relative(dir, full);
        if (rel.startsWith('..') || isAbsolute(rel)) {
            continue;
        }
        if (existsSync(full)) {
            return full;
        }
    }
    return undefined;
}
