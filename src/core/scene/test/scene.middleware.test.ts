const mockQueryAssetInfo = jest.fn();
const mockReadFile = jest.fn();

jest.mock('../../assets', () => ({
    assetManager: {
        queryAssetInfo: (...args: unknown[]) => mockQueryAssetInfo(...args),
    },
}));

jest.mock('fs-extra', () => ({
    readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import sceneMiddleware from '../scene.middleware';

const uuid = '04796f71-2f24-4b07-81d2-01f528b45157';
const filePath = '/tmp/04796f71-2f24-4b07-81d2-01f528b45157.json';
const fileContent = Buffer.from('{"name":"effect"}');

function createResponse() {
    const response = {
        setHeader: jest.fn(),
        status: jest.fn(),
        send: jest.fn(),
        json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    return response;
}

function createRequest(userAgent: string): any {
    return {
        params: { dir: uuid.slice(0, 2), uuid, ext: 'json' },
        query: {},
        headers: { 'user-agent': userAgent },
    };
}

describe('scene asset middleware', () => {
    const route = sceneMiddleware.get!.find((item) => item.url === '/:dir/:uuid.:ext');
    const queryAssetInfoRoute = sceneMiddleware.get!.find((item) => (
        item.url instanceof RegExp && item.url.source === '^\\/query-asset-info\\/(.+)$'
    ));

    beforeEach(() => {
        jest.clearAllMocks();
        mockQueryAssetInfo.mockReturnValue({ library: { '.json': filePath } });
        mockReadFile.mockResolvedValue(fileContent);
    });

    it('serves asset bytes to the PinK browser renderer', async () => {
        const response = createResponse();

        await route!.handler(
            createRequest('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36'),
            response as any,
        );

        expect(mockReadFile).toHaveBeenCalledWith(filePath);
        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.send).toHaveBeenCalledWith(fileContent);
    });

    it('returns the asset path to the Node scene engine xhr2 client', async () => {
        const response = createResponse();

        await route!.handler(
            createRequest('Mozilla/5.0 (darwin arm64) node.js/22.22.0 v8/12.4.254.21-node.24'),
            response as any,
        );

        expect(mockReadFile).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.send).toHaveBeenCalledWith(filePath);
    });

    it('decodes asset URLs before querying asset info', async () => {
        const response = createResponse();
        const dbUrl = 'db://internal/effects/builtin-standard.effect';
        const assetInfo = { uuid: 'builtin-standard-uuid', url: dbUrl };
        mockQueryAssetInfo.mockReturnValueOnce(assetInfo);

        await queryAssetInfoRoute!.handler(
            { params: { 0: encodeURIComponent(dbUrl) } } as any,
            response as any,
        );

        expect(mockQueryAssetInfo).toHaveBeenCalledWith(dbUrl);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(assetInfo);
    });
});
