import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import { basename, join } from 'path';
import ejs from 'ejs';
import { GlobalPaths } from '../../global';
import { scriptingRoutes } from '../preview/scripting-routes';

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
