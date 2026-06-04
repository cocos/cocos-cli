import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response } from 'express';

export default {
    get: [],
    post: [
        {
            url: '/create-asset',
            async handler(req: Request, res: Response) {
                try {
                    const { assetManager } = await import('../assets');
                    const { dbURL, content } = req.body;
                    if (!dbURL) {
                        return res.status(400).json({ error: 'dbURL is required' });
                    }
                    const result = await assetManager.createAsset({ target: dbURL, content: content || '' });
                    res.status(200).json({ success: true, result });
                } catch (e: any) {
                    res.status(500).json({ error: e.message });
                }
            },
        },
        {
            url: '/delete-asset',
            async handler(req: Request, res: Response) {
                try {
                    const { assetManager } = await import('../assets');
                    const { dbURL } = req.body;
                    if (!dbURL) {
                        return res.status(400).json({ error: 'dbURL is required' });
                    }
                    const result = await assetManager.removeAsset(dbURL, { useTrash: false });
                    res.status(200).json({ success: true, result });
                } catch (e: any) {
                    res.status(500).json({ error: e.message });
                }
            },
        },
    ],
    socket: {
        connection: (_socket: any) => { },
        disconnect: (_socket: any) => { }
    },
} as IMiddlewareContribution;
