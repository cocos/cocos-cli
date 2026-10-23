import type { Request, Response, NextFunction } from 'express';
import { join, relative, isAbsolute } from 'path';
import { readJSON, pathExists, stat } from 'fs-extra';
import { GlobalPaths } from '../../../../global';

/** CLI-owned browser artifacts. Build IDs prevent mixing chunks from different releases. */
export const browserRuntimeRoutes = [{
    url: /^\/scripting\/scene-runtime(?:\/|$)/,
    async handler(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        try {
            const root = join(GlobalPaths.staticDir, 'scene-runtime');
            const manifestFile = join(root, 'manifest.json');
            if (!(await pathExists(manifestFile))) {
                return res.status(503).json({ error: 'CLI browser runtime is unavailable; run npm run build:scene-runtime in cocos-cli' });
            }
            const manifest = await readJSON(manifestFile);
            if (req.path === '/scripting/scene-runtime/manifest.json') {
                res.setHeader('Cache-Control', 'no-store');
                return res.json(manifest);
            }
            if (req.path === '/scripting/scene-runtime/host.js') {
                res.setHeader('Cache-Control', 'no-store');
                res.sendFile(join(root, 'host.js'), { dotfiles: 'allow' });
                return;
            }
            const prefix = `/scripting/scene-runtime/${manifest.buildId}/`;
            if (!req.path.startsWith(prefix)) return res.sendStatus(404);
            const name = decodeURIComponent(req.path.slice(prefix.length));
            const file = join(root, name);
            const within = relative(root, file);
            if (within.startsWith('..') || isAbsolute(within) || name.includes('\\')) return res.sendStatus(403);
            if (!/\.(?:js|json|map)$/.test(name) || name === 'manifest.json' || !(await pathExists(file)) || !(await stat(file)).isFile()) {
                return res.sendStatus(404);
            }
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.sendFile(file, { dotfiles: 'allow' });
        } catch (error) { next(error); }
    },
}];
