import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
    AssetsTestContext,
    generateTestId,
    setupAssetsTestEnvironment,
    teardownAssetsTestEnvironment,
} from '../../helpers/test-utils';

describe.each(['scene', 'prefab'] as const)('MCP %s recovery', (type) => {
    let context: AssetsTestContext;
    let sceneUrl: string;
    let sourcePath: string;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    beforeEach(async () => {
        const name = `recovery-${generateTestId()}`;
        const created = await context.mcpClient.callTool('scene-create', {
            options: { baseName: name, dbURL: context.testRootUrl, templateType: '2d' },
        });
        expect(created.code).toBe(200);
        sceneUrl = created.data.assetUrl;
        sourcePath = join(context.testRootPath, `${name}.scene`);
        const opened = await context.mcpClient.callTool('scene-open', {
            options: { dbURLOrUUID: sceneUrl },
        });
        expect(opened.code).toBe(200);
        if (type === 'prefab') {
            const root = await context.mcpClient.callTool('scene-create-node-by-type', {
                options: { path: '', name: 'PrefabRoot', nodeType: 'Empty' },
            });
            expect(root.code).toBe(200);
            sceneUrl = `${context.testRootUrl}/${name}.prefab`;
            sourcePath = join(context.testRootPath, `${name}.prefab`);
            const prefab = await context.mcpClient.callTool('create-prefab-from-node', {
                options: { nodePath: root.data.path, dbURL: sceneUrl },
            });
            expect(prefab.code).toBe(200);
            const discarded = await context.mcpClient.callTool('scene-discard', {
                options: { discardChanges: true },
            });
            expect(discarded.code).toBe(200);
            const openedPrefab = await context.mcpClient.callTool('scene-open', {
                options: { dbURLOrUUID: sceneUrl },
            });
            expect(openedPrefab.code).toBe(200);
        }
    });

    afterEach(async () => {
        if (!context) return;
        const discarded = await context.mcpClient.callTool('scene-discard', {
            options: { discardChanges: true },
        });
        expect(discarded.code).toBe(200);
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    async function addUnsavedNode() {
        const created = await context.mcpClient.callTool('scene-create-node-by-type', {
            options: { path: '', name: 'Unsaved', nodeType: 'Empty' },
        });
        expect(created.code).toBe(200);
        return created.data.path;
    }

    test('scene-discard closes live edits without writing the source', async () => {
        const original = await readFile(sourcePath, 'utf8');
        const nodePath = await addUnsavedNode();

        const discarded = await context.mcpClient.callTool('scene-discard', {
            options: { discardChanges: true },
        });
        expect(discarded.code).toBe(200);
        expect(discarded.data).toBe(true);
        expect(await readFile(sourcePath, 'utf8')).toBe(original);
        const current = await context.mcpClient.callTool('scene-query-current', {});
        expect(current.data).toBeUndefined();

        const reopened = await context.mcpClient.callTool('scene-open', {
            options: { dbURLOrUUID: sceneUrl },
        });
        expect(reopened.code).toBe(200);
        const missing = await context.mcpClient.callTool('scene-query-node', { options: { path: nodePath } });
        expect(missing.code).not.toBe(200);
    });

    test('scene-reload-from-disk loads external edits without saving live state', async () => {
        const original = await readFile(sourcePath, 'utf8');
        const nodePath = await addUnsavedNode();
        const data = JSON.parse(original) as Array<{ __type__: string; _name?: string; _lpos?: { x: number } }>;
        const scene = data.find(entry => entry.__type__ === (type === 'scene' ? 'cc.Scene' : 'cc.Node'))!;
        if (type === 'scene') scene._name = 'Changed on disk';
        else scene._lpos!.x = 123;
        const external = JSON.stringify(data, null, 2);
        await writeFile(sourcePath, external);

        const reloaded = await context.mcpClient.callTool('scene-reload-from-disk', {
            options: { discardChanges: true, includeChildren: false },
        });
        expect(reloaded.code).toBe(200);
        if (type === 'scene') expect(reloaded.data.name).toBe('Changed on disk');
        else expect(reloaded.data).toMatchObject({ properties: { position: { x: 123 } } });
        expect(reloaded.data.children).toBeUndefined();
        expect(await readFile(sourcePath, 'utf8')).toBe(external);
        const missing = await context.mcpClient.callTool('scene-query-node', { options: { path: nodePath } });
        expect(missing.code).not.toBe(200);
    });

    test('scene-reload-from-disk discards edits when the source file is unchanged', async () => {
        const original = await readFile(sourcePath, 'utf8');
        const nodePath = await addUnsavedNode();
        const reloaded = await context.mcpClient.callTool('scene-reload-from-disk', {
            options: { discardChanges: true },
        });
        expect(reloaded.code).toBe(200);
        expect(await readFile(sourcePath, 'utf8')).toBe(original);
        const missing = await context.mcpClient.callTool('scene-query-node', { options: { path: nodePath } });
        expect(missing.code).not.toBe(200);
    });

    test('scene-reload-from-disk stays closed without saving live edits when import fails', async () => {
        const original = await readFile(sourcePath, 'utf8');
        await addUnsavedNode();
        try {
            await writeFile(sourcePath, '{ invalid JSON');
            const reloaded = await context.mcpClient.callTool('scene-reload-from-disk', {
                options: { discardChanges: true },
            });
            expect(reloaded.code).not.toBe(200);
            const current = await context.mcpClient.callTool('scene-query-current', {});
            expect(current.code).toBe(200);
            expect(current.data).toBeUndefined();
            expect(await readFile(sourcePath, 'utf8')).toBe('{ invalid JSON');
        } finally {
            await writeFile(sourcePath, original);
        }
    });
});
