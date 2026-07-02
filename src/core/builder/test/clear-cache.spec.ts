import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { outputFile, pathExists, readdir } from 'fs-extra';

const mockBuilderConfig = {
    projectRoot: '',
    projectTempDir: '',
};

const mockGlobalPaths = {
    enginePath: '',
};

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: mockBuilderConfig,
}));

jest.mock('../../../global', () => ({
    GlobalPaths: mockGlobalPaths,
}));

import { clearCache } from '../cache';

describe('builder clearCache', () => {
    let tempRoot = '';

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-clear-cache-'));
        mockBuilderConfig.projectRoot = join(tempRoot, 'project');
        mockBuilderConfig.projectTempDir = join(mockBuilderConfig.projectRoot, 'temp');
        mockGlobalPaths.enginePath = join(tempRoot, 'engine');
    });

    afterEach(async () => {
        await rm(tempRoot, { recursive: true, force: true });
    });

    it('clears project builder cache while preserving logs and non-build asset-db files', async () => {
        const assetBuildCacheFile = join(mockBuilderConfig.projectTempDir, 'asset-db', 'assets', 'ab', 'uuid', 'build1.0.1', 'release.json');
        const assetOtherFile = join(mockBuilderConfig.projectTempDir, 'asset-db', 'assets', 'ab', 'uuid', 'thumbnail.png');
        const builderCacheFile = join(mockBuilderConfig.projectTempDir, 'builder', 'CompressTexture', 'compress-info.json');
        const logFile = join(mockBuilderConfig.projectTempDir, 'builder', 'log', 'build.log');

        await outputFile(assetBuildCacheFile, '{}');
        await outputFile(assetOtherFile, 'image');
        await outputFile(builderCacheFile, '{}');
        await outputFile(logFile, 'log');

        const result = await clearCache('project');

        expect(result.scope).toBe('project');
        expect(await pathExists(assetBuildCacheFile)).toBe(false);
        expect(await pathExists(assetOtherFile)).toBe(true);
        expect(await pathExists(builderCacheFile)).toBe(false);
        expect(await pathExists(logFile)).toBe(true);
    });

    it('clears legacy asset build cache under temp builder while preserving non-build files', async () => {
        const legacyAssetBuildCacheFile = join(mockBuilderConfig.projectTempDir, 'builder', 'asset-db', 'assets', 'ab', 'uuid', 'build1.0.1', 'release.json');
        const legacyAssetOtherFile = join(mockBuilderConfig.projectTempDir, 'builder', 'asset-db', 'assets', 'ab', 'uuid', 'thumbnail.png');

        await outputFile(legacyAssetBuildCacheFile, '{}');
        await outputFile(legacyAssetOtherFile, 'image');

        const result = await clearCache('project');

        expect(result.scope).toBe('project');
        expect(await pathExists(legacyAssetBuildCacheFile)).toBe(false);
        expect(await pathExists(legacyAssetOtherFile)).toBe(true);
    });

    it('clears global engine cache directories', async () => {
        const engineTempFile = join(mockGlobalPaths.enginePath, 'bin', 'temp', 'engine-cache.js');
        const editorCacheFile = join(mockGlobalPaths.enginePath, 'bin', '.cache', 'editor-cache', 'wechatgame', 'meta.json');
        const devCliCacheFile = join(mockGlobalPaths.enginePath, 'bin', '.cache', 'dev-cli', 'cc.js');
        const engineLogFile = join(mockGlobalPaths.enginePath, 'bin', '.cache', 'logs', 'log.txt');

        await outputFile(engineTempFile, 'engine');
        await outputFile(editorCacheFile, '{}');
        await outputFile(devCliCacheFile, 'cc');
        await outputFile(engineLogFile, 'log');

        const result = await clearCache('global');

        expect(result.scope).toBe('global');
        await expect(readdir(join(mockGlobalPaths.enginePath, 'bin', 'temp'))).resolves.toEqual([]);
        await expect(readdir(join(mockGlobalPaths.enginePath, 'bin', '.cache', 'editor-cache'))).resolves.toEqual([]);
        await expect(readdir(join(mockGlobalPaths.enginePath, 'bin', '.cache', 'dev-cli'))).resolves.toEqual([]);
        expect(await pathExists(engineLogFile)).toBe(true);
    });

    it('clears project and global cache when scope is all', async () => {
        const projectCacheFile = join(mockBuilderConfig.projectTempDir, 'builder', 'TexturePacker1.0.1', 'build', 'atlas.json');
        const globalCacheFile = join(mockGlobalPaths.enginePath, 'bin', 'temp', 'engine-cache.js');

        await outputFile(projectCacheFile, '{}');
        await outputFile(globalCacheFile, 'engine');

        const result = await clearCache('all');

        expect(result.scope).toBe('all');
        expect(await pathExists(projectCacheFile)).toBe(false);
        await expect(readdir(join(mockGlobalPaths.enginePath, 'bin', 'temp'))).resolves.toEqual([]);
    });

    it('rejects invalid cache scope at runtime', async () => {
        await expect(clearCache('invalid' as any)).rejects.toThrow('Invalid builder cache scope');
    });
});
