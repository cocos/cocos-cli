import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import path, { basename, join } from 'path';
import ejs from 'ejs';
import { pathExists, stat } from 'fs-extra';
import { GlobalPaths } from '../../global';
import { readFileSync } from 'fs';

export default {
    get: [
        {
            url: '/',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const renderData = {
                        title: `Cocos Creator Preview - ${basename(scripting.projectPath)}`,
                        serverURL: serverBaseUrl
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'index.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/scripting/web-env',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { Engine } = await import('../engine');
                    const enginePath = Engine.getInfo().typescript.path;
                    const { default: scripting } = await import('../../core/scripting');
                    res.json({
                        projectPath: scripting.projectPath.replace(/\\/g, '/'),
                        enginePath: enginePath.replace(/\\/g, '/'),
                    });
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: /^\/scripting\/engine-dist/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                    const facet = await waitForProgrammingFacet();
                    let relPath = req.path.substring('/scripting/engine-dist'.length);
                    relPath = decodeURIComponent(relPath);
                    const resourcePath = join(facet.engineDistRoot, relPath);
                    if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                        res.sendFile(resourcePath, { dotfiles: 'allow' });
                    } else {
                        next();
                    }
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/scripting/engine/game-config',
            async handler(req: Request, res: Response) {
                const { Engine } = await import('../engine');
                const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                const config = await Engine.getGameConfig(serverBaseUrl, serverBaseUrl, serverBaseUrl);
                res.json(config);
            },
        },
        {
            url: '/scripting/engine/modules',
            async handler(req: Request, res: Response) {
                const { Engine } = await import('../engine');
                const modules = Engine.getModules();
                res.json(modules);
            },
        },
        {
            url: '/scripting/engine/bin/.editor/:filename',
            async handler(req: Request, res: Response) {
                const { filename } = req.params;
                const { Engine } = await import('../engine');
                const enginePath = Engine.getInfo().typescript.path;
                const engineFilePath = path.join(enginePath, 'bin', '.editor', filename);

                try {
                    const content = readFileSync(engineFilePath);
                    res.setHeader('Content-Type', 'application/javascript');
                    res.status(200).send(content);
                } catch (error) {
                    res.status(404).send('File not found');
                }
            },
        },
        {
            url: '/scripting/engine/effect-settings',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const effectBinPath = join(scripting.projectPath, 'temp', 'asset-db', 'effect', 'effect.bin');
                    if (await pathExists(effectBinPath) && (await stat(effectBinPath)).isFile()) {
                        res.sendFile(effectBinPath);
                    } else {
                        next();
                    }
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: '/scripting/import-map-global',
            async handler(req: Request, res: Response) {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();
                const importMap = await facet.getGlobalImportMap();
                console.log(`[Preview Server] Global import map:`, JSON.stringify(importMap, null, 2).substring(0, 500));
                res.json(importMap);
            },
        },
        {
            url: /^\/scripting\/x/,
            async handler(req: Request, res: Response, next: NextFunction) {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();

                const url = req.path.substring('/scripting/x'.length).replace(/^\//, '');
                if (url === '' || url === '/') {
                    return next();
                }

                // Special handling for pack import-map and resolution-detail-map
                if (url === 'pack-import-map-url') {
                    try {
                        const resource = await facet.loadPackResource(facet.packImportMapURL);
                        if (resource.type === 'json') {
                            const importMap = resource.json as any;
                            // 移除 cce:/internal/x/cc 映射和相关 scope：
                            // pack 的 cc chunk 依赖 cce:/internal/x/cc-fu/*（engine feature units），
                            // 浏览器中 System-A 无法解析这些协议。
                            // 让 System-A 使用全局 import map 的 cc → q-bundled:///virtual/cc.js。
                            if (importMap.imports) {
                                const ccChunkUrl = importMap.imports['cce:/internal/x/cc'];
                                delete importMap.imports['cce:/internal/x/cc'];
                                // 移除 cc chunk 的 scope（包含 cc-fu/* 依赖）
                                if (ccChunkUrl && importMap.scopes) {
                                    delete importMap.scopes[ccChunkUrl];
                                }
                                // 移除其他 scope 中对 cc chunk 的引用，改用全局 cc
                                if (importMap.scopes) {
                                    for (const scope of Object.values(importMap.scopes) as Record<string, string>[]) {
                                        if (scope.cc === ccChunkUrl) {
                                            delete scope.cc;
                                        }
                                    }
                                }
                            }
                            return res.json(importMap);
                        }
                        return next(new Error('Unexpected pack resource type'));
                    } catch (err) {
                        return next(err);
                    }
                }
                if (url === 'resolution-detail-map') {
                    try {
                        const resource = await facet.loadPackResource(facet.packResolutionDetailMapURL);
                        if (resource.type === 'json') {
                            return res.json(resource.json);
                        }
                        return next(new Error('Unexpected pack resource type'));
                    } catch (err) {
                        return next(err);
                    }
                }

                // Forward query string
                const query = Object.keys(req.query).length === 0 ? '' : `?${new URLSearchParams(req.query as any).toString()}`;
                const fullUrl = url + query;

                console.log(`[Preview Server] Packing resource requested: ${fullUrl}`);
                try {
                    const packResource = await facet.loadPackResource(fullUrl);
                    if (packResource.type === 'json') {
                        res.json(packResource.json);
                    } else if (packResource.type === 'chunk') {
                        res.sendFile(packResource.chunk.path);
                    } else {
                        console.warn(`[Preview Server] Unknown pack resource type for ${fullUrl}:`, packResource);
                        next(new Error('Unknown pack resource type'));
                    }
                } catch (err) {
                    console.error(`[Preview Server] Failed to load pack resource ${fullUrl}:`, err);
                    next(err);
                }
            },
        },
        {
            url: /^\/chunks\//,
            async handler(req: Request, res: Response, next: NextFunction) {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();
                const url = req.path.substring(1);
                try {
                    const packResource = await facet.loadPackResource(url);
                    if (packResource.type === 'chunk') {
                        res.sendFile(packResource.chunk.path);
                    } else if (packResource.type === 'json') {
                        res.json(packResource.json);
                    } else {
                        next();
                    }
                } catch (err) {
                    next(err);
                }
            },
        },
        {
            url: /^\/scripting\/engine/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { Engine } = await import('../engine');
                    const enginePath = Engine.getInfo().typescript.path;
                    // Use req.originalUrl because some directories have percent-encoded
                    // names on disk (e.g. "external%3Aemscripten"). Express decodes
                    // req.path, turning %3A into ':', which breaks lookup.
                    // Decode ONE level of percent-encoding: %253A → %3A (files on disk
                    // use single-encoded names, but SystemJS deps use double-encoded).
                    const rawPath = req.originalUrl.split('?')[0];
                    let relPath = rawPath.substring('/scripting/engine'.length);
                    relPath = decodeURIComponent(relPath);
                    const { default: scripting } = await import('../../core/scripting');
                    // Try engine root first — preserve percent-encoded dir names
                    let resourcePath = join(enginePath, relPath);

                    // If not found, try project temp engine target
                    if (!(await pathExists(resourcePath))) {
                        const engineDistBase = '/bin/.cache/dev-cli/web';
                        let projectorRelPath = relPath;
                        if (relPath.startsWith(engineDistBase)) {
                            projectorRelPath = relPath.substring(engineDistBase.length);
                        }
                        resourcePath = join(scripting.projectPath, 'temp', 'programming', 'packer-driver', 'targets', 'preview', projectorRelPath).replace(/\\/g, '/');
                    }

                    // If it's a directory, try index.json or index.js
                    if (await pathExists(resourcePath) && (await stat(resourcePath)).isDirectory()) {
                        const indexJson = join(resourcePath, 'index.json');
                        if (await pathExists(indexJson)) {
                            resourcePath = indexJson;
                        }
                    }

                    if (!(await pathExists(resourcePath)) && !relPath.endsWith('.js')) {
                        const jsPath = `${resourcePath}.js`;
                        if (await pathExists(jsPath)) {
                            resourcePath = jsPath;
                        }
                    }

                    console.log(`[Preview Server] Engine resource requested: ${req.path} -> ${resourcePath}`);
                    if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                        res.sendFile(resourcePath, { dotfiles: 'allow' });
                    } else {
                        console.warn(`[Preview Server] Engine resource NOT FOUND on disk: ${resourcePath}`);
                        next();
                    }
                } catch (err) {
                    console.error('[Preview Server] Engine handler error:', err);
                    next(err);
                }
            },
        },
        {
            url: /^\/scripting\//,
            async handler(req: Request, res: Response, next: NextFunction) {
                const relPath = req.path.substring('/scripting/'.length);
                // Handle absolute monorepo paths resolved by Rollup
                if (relPath.includes('code/cocos-cli/') || relPath.includes('code\\cocos-cli\\')) {
                    const monorepoPath = relPath.split('code/cocos-cli/')[1] || relPath.split('code\\cocos-cli\\')[1];
                    let resourcePath = join(GlobalPaths.workspace, monorepoPath);
                    if (!(await pathExists(resourcePath))) {
                        resourcePath = `${resourcePath}.js`;
                    }
                    if (!(await pathExists(resourcePath))) {
                        const jsonPath = `${resourcePath.replace(/\.js$/, '')}.json`;
                        if (await pathExists(jsonPath)) {
                            resourcePath = jsonPath;
                        }
                    }
                    if (!(await pathExists(resourcePath)) || !(await stat(resourcePath)).isFile()) {
                        // Try index.js if it's a directory or not a file
                        const dirPath = resourcePath.replace(/\.js$/, '');
                        const indexPath = join(dirPath, 'index.js');
                        if (await pathExists(indexPath)) {
                            resourcePath = indexPath;
                        }
                    }
                    console.log(`[Preview Server] Monorepo resource requested: ${req.path} -> ${resourcePath}`);
                    if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                        return res.sendFile(resourcePath, { dotfiles: 'allow' });
                    }
                }
                next();
            },
        },
        {
            url: /^\/static\/web/,
            async handler(req: Request, res: Response, next: NextFunction) {
                const relPath = req.path.substring('/static/web'.length);
                const resourcePath = join(GlobalPaths.workspace, 'static', 'web', relPath);
                console.log(`[Preview Server] Static resource requested: ${relPath} -> ${resourcePath}`);
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    res.sendFile(resourcePath);
                } else {
                    console.warn(`[Preview Server] Static resource not found: ${resourcePath}`);
                    next();
                }
            },
        },
        {
            url: /^\/scripting\/systemjs/,
            async handler(req: Request, res: Response, next: NextFunction) {
                const { waitForProgrammingFacet } = await import('../scripting/programming/FacetInstance');
                const facet = await waitForProgrammingFacet();
                const relPath = req.path.substring('/scripting/systemjs'.length);
                if (relPath.startsWith('/extras/')) {
                    const extraPath = join(GlobalPaths.workspace, 'node_modules', '@cocos', 'systemjs', 'dist', relPath);
                    if (await pathExists(extraPath) && (await stat(extraPath)).isFile()) {
                        return res.sendFile(extraPath);
                    }
                }
                const resourcePath = join(facet.systemJsHomeDir, relPath);
                console.log(`[Preview Server] SystemJS resource requested: ${relPath} -> ${resourcePath}`);
                if (await pathExists(resourcePath) && (await stat(resourcePath)).isFile()) {
                    res.sendFile(resourcePath);
                } else {
                    console.warn(`[Preview Server] SystemJS resource not found: ${resourcePath}`);
                    next();
                }
            },
        },
        {
            url: /^\/scripting\/scene/,
            async handler(req: Request, res: Response, next: NextFunction) {
                let relPath = req.path.substring('/scripting/scene'.length);
                try {
                    relPath = decodeURIComponent(relPath);
                } catch {
                    // Ignore error
                }
                const resourcePath = join(GlobalPaths.workspace, 'dist', 'core', 'scene', relPath);
                let finalPath = resourcePath;
                if (!(await pathExists(finalPath))) {
                    finalPath = `${finalPath}.js`;
                }

                if (await pathExists(finalPath) && (await stat(finalPath)).isFile()) {
                    res.sendFile(finalPath, { dotfiles: 'allow' });
                } else {
                    next();
                }
            },
        },
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (_socket: any) => { },
        disconnect: (_socket: any) => { }
    },
} as IMiddlewareContribution;
