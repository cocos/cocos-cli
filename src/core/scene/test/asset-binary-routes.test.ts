import { PassThrough, Readable } from 'stream';
import type { Request, Response } from 'express';
import {
    createAssetBinaryRoutes,
    readBinaryBody,
} from '../asset-binary-routes';

const assetInfo = { uuid: '10f83b52-8786-4de7-89e1-92e34e3176fc' } as any;

function createRequest(options: {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    contentType?: string;
} = {}) {
    const request = new PassThrough() as PassThrough & Partial<Request>;
    request.params = options.params ?? {};
    request.query = (options.query ?? {}) as any;
    request.headers = options.contentType === undefined
        ? {}
        : { 'content-type': options.contentType };
    return request as unknown as Request & PassThrough;
}

function createResponse() {
    const response = {
        status: jest.fn(),
        json: jest.fn(),
        destroyed: false,
        headersSent: false,
    };
    response.status.mockReturnValue(response);
    return response as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function routesFor(assetManager: { saveAsset: jest.Mock; createAsset: jest.Mock }) {
    return createAssetBinaryRoutes({ loadAssetManager: async () => assetManager as any });
}

describe('Asset binary routes', () => {
    it('passes the save body as a Node Buffer and returns the encoded asset info', async () => {
        const assetManager = {
            saveAsset: jest.fn().mockResolvedValue(assetInfo),
            createAsset: jest.fn(),
        };
        const route = routesFor(assetManager).find((entry) => entry.url === '/assets/binary/v1/save/:assetUuid');
        const req = createRequest({
            params: { assetUuid: assetInfo.uuid },
            contentType: 'application/octet-stream',
        });
        const res = createResponse();

        const handled = route!.handler(req, res);
        req.end(Buffer.from([0, 1, 127, 255]));
        await handled;

        expect(assetManager.saveAsset).toHaveBeenCalledWith(assetInfo.uuid, expect.any(Buffer));
        expect(assetManager.saveAsset.mock.calls[0][1]).toEqual(Buffer.from([0, 1, 127, 255]));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(assetInfo);
    });

    it('accepts only db:// targets and explicit overwrite metadata for create', async () => {
        const assetManager = {
            saveAsset: jest.fn(),
            createAsset: jest.fn().mockResolvedValue(assetInfo),
        };
        const route = routesFor(assetManager).find((entry) => entry.url === '/assets/binary/v1/create');
        const req = createRequest({
            query: { target: 'db://assets/terrain/New.terrain', overwrite: 'true' },
            contentType: 'application/octet-stream; charset=binary',
        });
        const res = createResponse();

        const handled = route!.handler(req, res);
        req.end(Buffer.from([4, 5, 6]));
        await handled;

        expect(assetManager.createAsset).toHaveBeenCalledWith({
            target: 'db://assets/terrain/New.terrain',
            overwrite: true,
            content: Buffer.from([4, 5, 6]),
        });
        expect(res.json).toHaveBeenCalledWith(assetInfo);
    });

    it('rejects an unsupported media type before loading the Asset Manager', async () => {
        const assetManager = {
            saveAsset: jest.fn(),
            createAsset: jest.fn(),
        };
        const route = routesFor(assetManager).find((entry) => entry.url === '/assets/binary/v1/save/:assetUuid');
        const res = createResponse();

        await route!.handler(createRequest({
            params: { assetUuid: assetInfo.uuid },
            contentType: 'application/json',
        }), res);

        expect(res.status).toHaveBeenCalledWith(415);
        expect(res.json).toHaveBeenCalledWith({ error: 'Content-Type must be application/octet-stream' });
        expect(assetManager.saveAsset).not.toHaveBeenCalled();
    });

    it('rejects non-db targets and non-boolean overwrite values before reading the body', async () => {
        const assetManager = {
            saveAsset: jest.fn(),
            createAsset: jest.fn(),
        };
        const route = routesFor(assetManager).find((entry) => entry.url === '/assets/binary/v1/create');
        const res = createResponse();

        await route!.handler(createRequest({
            query: { target: '/project/assets/New.terrain', overwrite: 'yes' },
            contentType: 'application/octet-stream',
        }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'target must be a db:// URL' });
        expect(assetManager.createAsset).not.toHaveBeenCalled();
    });

    it('enforces the configured raw-body limit while reading chunks', async () => {
        const req = Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4])]) as Request;

        await expect(readBinaryBody(req, 3)).rejects.toMatchObject({ status: 413 });
    });

    it('maps Asset Manager failures to a JSON HTTP error', async () => {
        const assetManager = {
            saveAsset: jest.fn().mockRejectedValue(new Error('asset is readonly')),
            createAsset: jest.fn(),
        };
        const route = routesFor(assetManager).find((entry) => entry.url === '/assets/binary/v1/save/:assetUuid');
        const req = createRequest({
            params: { assetUuid: assetInfo.uuid },
            contentType: 'application/octet-stream',
        });
        const res = createResponse();

        const handled = route!.handler(req, res);
        req.end(Buffer.from([1]));
        await handled;

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'asset is readonly' });
    });
});
