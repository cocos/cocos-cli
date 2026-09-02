import type { IAssetInfo } from '../../assets/@types/public';
import {
    SceneAssetBinaryClient,
    type SceneAssetBinaryClientDependencies,
} from '../scene-process/scene-asset-binary-client';

const assetInfo = { uuid: '10f83b52-8786-4de7-89e1-92e34e3176fc' } as IAssetInfo;

function createClient(overrides: Partial<SceneAssetBinaryClientDependencies> = {}) {
    const dependencies: SceneAssetBinaryClientDependencies = {
        getWebServerUrl: () => 'http://localhost:7456',
        fetch: jest.fn() as unknown as typeof fetch,
        saveLocally: jest.fn(),
        createLocally: jest.fn(),
        ...overrides,
    };
    return {
        client: new SceneAssetBinaryClient(dependencies),
        dependencies,
    };
}

function response(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}

describe('SceneAssetBinaryClient', () => {
    it('posts existing Terrain bytes unchanged to the dedicated save endpoint in web mode', async () => {
        const { client, dependencies } = createClient();
        const bytes = new Uint8Array([0, 1, 127, 255]);
        (dependencies.fetch as jest.Mock).mockResolvedValue(response(200, assetInfo));

        await expect(client.save(assetInfo.uuid, bytes)).resolves.toStrictEqual(assetInfo);

        expect(dependencies.fetch).toHaveBeenCalledWith(
            `http://localhost:7456/assets/binary/v1/save/${assetInfo.uuid}`,
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: bytes,
            }),
        );
        expect(dependencies.saveLocally).not.toHaveBeenCalled();
    });

    it('encodes create metadata in the URL while keeping the content as the raw body', async () => {
        const { client, dependencies } = createClient();
        const bytes = new Uint8Array([3, 2, 1]);
        (dependencies.fetch as jest.Mock).mockResolvedValue(response(200, assetInfo));

        await expect(client.create({
            target: 'db://assets/terrain/New terrain.terrain',
            overwrite: true,
            content: bytes,
        })).resolves.toStrictEqual(assetInfo);

        expect(dependencies.fetch).toHaveBeenCalledWith(
            'http://localhost:7456/assets/binary/v1/create?target=db%3A%2F%2Fassets%2Fterrain%2FNew+terrain.terrain&overwrite=true',
            expect.objectContaining({ body: bytes }),
        );
    });

    it('keeps native Scene workers on their existing Asset Manager transport', async () => {
        const saveLocally = jest.fn().mockResolvedValue(assetInfo);
        const createLocally = jest.fn().mockResolvedValue(assetInfo);
        const { client, dependencies } = createClient({
            getWebServerUrl: () => undefined,
            saveLocally,
            createLocally,
        });
        const bytes = new Uint8Array([5, 6]);

        await expect(client.save(assetInfo.uuid, bytes)).resolves.toBe(assetInfo);
        await expect(client.create({
            target: 'db://assets/terrain/New.terrain',
            overwrite: false,
            content: bytes,
        })).resolves.toBe(assetInfo);

        expect(saveLocally).toHaveBeenCalledWith(assetInfo.uuid, bytes);
        expect(createLocally).toHaveBeenCalledWith({
            target: 'db://assets/terrain/New.terrain',
            overwrite: false,
            content: bytes,
        });
        expect(dependencies.fetch).not.toHaveBeenCalled();
    });

    it('surfaces the route error body together with the HTTP status', async () => {
        const { client, dependencies } = createClient();
        (dependencies.fetch as jest.Mock).mockResolvedValue(response(413, { error: 'Raw binary body exceeds 50 MiB' }));

        await expect(client.save(assetInfo.uuid, new Uint8Array())).rejects
            .toThrow('Scene binary asset request failed with status 413: Raw binary body exceeds 50 MiB');
    });
});
