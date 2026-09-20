import type { Request, Response, NextFunction } from 'express';
import { join, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { pathExists } from 'fs-extra';
export const sceneResourceRoutes = [
{
            url: '/scene-editor/settings.json',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { getCachedSceneEditorSettings } = await import('./settings');
                    const result = await getCachedSceneEditorSettings();
                    res.set('Cache-Control', 'no-store');
                    res.status(200).json({
                        settings: result.settings,
                        bundleConfigs: result.bundleConfigs,
                    });
                } catch (err) {
                    const { PreviewNotReadyError } = await import('./settings');
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
                    const { getCachedSceneEditorSettings } = await import('./settings');
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
                    const { getCachedSceneEditorSettings } = await import('./settings');
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
            url: '/scripting/effect-settings',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../../scripting/index');
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
        }
];
let sceneEditorLibraryDirsCache: string[] | null = null;

async function getSceneEditorLibraryDirs(): Promise<string[]> {
    if (sceneEditorLibraryDirsCache) {
        return sceneEditorLibraryDirsCache;
    }
    const { assetDBManager } = await import('../../../assets/index');
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
