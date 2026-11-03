const mockQueryAssetInfo = jest.fn();
const mockReadFile = jest.fn();
const mockPathExists = jest.fn();

jest.mock('../../assets', () => ({
    assetManager: {
        queryAssetInfo: (...args: unknown[]) => mockQueryAssetInfo(...args),
    },
    assetDBManager: {
        assetDBInfo: { internal: { library: '/proj/library' } },
    },
}));

jest.mock('fs-extra', () => ({
    readFile: (...args: unknown[]) => mockReadFile(...args),
    pathExists: (...args: unknown[]) => mockPathExists(...args),
}));

import path from 'path';
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

    it('serves a sole binary CCON library file through its advertised cconb URL', async () => {
        const response = createResponse();
        const binary = Buffer.from([67, 67, 79, 78, 0, 255, 128]);
        mockQueryAssetInfo.mockReturnValue({ library: { '.bin': '/tmp/clip.bin' } });
        mockReadFile.mockResolvedValue(binary);
        const request = createRequest('Mozilla/5.0');
        request.params.ext = 'cconb';
        await route!.handler(request, response as any);
        expect(mockReadFile).toHaveBeenCalledWith('/tmp/clip.bin');
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.send).toHaveBeenCalledWith(binary);
        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('does not reinterpret unrelated bin companions as CCON', async () => {
        const response = createResponse();
        mockQueryAssetInfo.mockReturnValue({ library: { '.bin': '/tmp/mesh.bin', '.json': '/tmp/mesh.json' } });
        mockPathExists.mockResolvedValue(false);
        const request = createRequest('Mozilla/5.0');
        request.params.ext = 'cconb';
        await route!.handler(request, response as any);
        expect(response.status).toHaveBeenCalledWith(404);
        expect(mockReadFile).not.toHaveBeenCalled();
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

    // 内置 effect（pipeline/cluster-build, uuid 前两位 45）不在 asset-db 索引里，引擎按
    // importBase 扁平路径 `${serverURL}/45/<uuid>.json` 拉取。此前只查 asset-db 必 404，
    // 管线建不起来 → 打开场景报 pipelineSceneData null。回退到 library 磁盘目录后修复。
    const builtinUuid = '45e7c0c8-2699-4912-b45f-d42bb8384189';
    const builtinFile = path.join('/proj/library', '45', `${builtinUuid}.json`);

    it('falls back to the library dir when asset-db has no record (builtin effect)', async () => {
        const response = createResponse();
        mockQueryAssetInfo.mockReturnValue(null); // 内置资源不在 asset-db
        mockPathExists.mockImplementation(async (p: string) => p === builtinFile);

        await route!.handler(
            {
                params: { dir: '45', uuid: builtinUuid, ext: 'json' },
                query: { isBrowser: 'true' },
                headers: {},
            } as any,
            response as any,
        );

        expect(mockReadFile).toHaveBeenCalledWith(builtinFile);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.send).toHaveBeenCalledWith(fileContent);
    });

    it('returns the library-dir path to the Node scene engine when asset-db misses', async () => {
        const response = createResponse();
        mockQueryAssetInfo.mockReturnValue(null);
        mockPathExists.mockImplementation(async (p: string) => p === builtinFile);

        await route!.handler(
            {
                params: { dir: '45', uuid: builtinUuid, ext: 'json' },
                query: {},
                headers: { 'user-agent': 'node.js/22.22.0' },
            } as any,
            response as any,
        );

        expect(mockReadFile).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.send).toHaveBeenCalledWith(builtinFile);
    });

    it('still 404s when neither asset-db nor any library dir has the file', async () => {
        const response = createResponse();
        mockQueryAssetInfo.mockReturnValue(null);
        mockPathExists.mockResolvedValue(false);

        await route!.handler(
            {
                params: { dir: '45', uuid: builtinUuid, ext: 'json' },
                query: {},
                headers: {},
                url: `/45/${builtinUuid}.json`,
            } as any,
            response as any,
        );

        expect(response.status).toHaveBeenCalledWith(404);
    });
});
