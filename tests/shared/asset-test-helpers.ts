import { existsSync } from 'fs-extra';
import { join } from 'path';
import { expect } from '@jest/globals';

/**
 * 资源测试共享验证函数
 * 用于单元测试和 E2E 测试复用
 * 
 * 注意：这些函数使用 Jest 原生断言（expect），可在单元测试和 E2E 测试中复用
 */

/**
 * 验证资源创建结果
 */
export interface AssetCreationResult {
    uuid: string;
    url: string;
    file: string;
    type?: string;
    isDirectory?: boolean;
}

/**
 * 验证资源是否创建成功
 */
export function validateAssetCreated(
    asset: AssetCreationResult | null,
    expectedType?: string,
    skipTypeCheck = false
): void {
    expect(asset).not.toBeNull();
    expect(asset!.uuid).toBeDefined();
    expect(asset!.url).toBeDefined();
    expect(asset!.file).toBeDefined();

    if (!skipTypeCheck && expectedType) {
        expect(asset!.type).toBe(expectedType);
    }
}

/**
 * 验证资源文件是否存在
 */
export function validateAssetFileExists(filePath: string): void {
    expect(existsSync(filePath)).toBe(true);
}

/**
 * 验证资源元数据文件是否存在
 */
export function validateAssetMetaExists(filePath: string): void {
    const metaPath = `${filePath}.meta`;
    expect(existsSync(metaPath)).toBe(true);
}

/**
 * 验证文件夹资源
 */
export function validateFolderAsset(asset: AssetCreationResult | null, folderPath: string): void {
    expect(asset).not.toBeNull();
    expect(asset!.isDirectory).toBe(true);

    validateAssetFileExists(folderPath);
    validateAssetMetaExists(folderPath);

    const stat = require('fs-extra').statSync(folderPath);
    expect(stat.isDirectory()).toBe(true);
}

/**
 * 验证文件资源
 */
export function validateFileAsset(
    asset: AssetCreationResult | null,
    filePath: string,
    expectedContent?: string
): void {
    expect(asset).not.toBeNull();
    expect(asset!.isDirectory).toBe(false);

    validateAssetFileExists(filePath);
    validateAssetMetaExists(filePath);

    if (expectedContent !== undefined) {
        const content = require('fs-extra').readFileSync(filePath, 'utf8');
        expect(content).toBe(expectedContent);
    }
}

/**
 * 验证资源删除结果
 */
export function validateAssetDeleted(filePath: string): void {
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.meta`)).toBe(false);
}

/**
 * 验证资源移动结果
 */
export function validateAssetMoved(sourcePath: string, destPath: string): void {
    // 源路径不应该存在
    validateAssetDeleted(sourcePath);

    // 目标路径应该存在
    validateAssetFileExists(destPath);
    validateAssetMetaExists(destPath);
}

/**
 * 验证资源复制结果
 */
export function validateAssetCopied(sourcePath: string, destPath: string): void {
    // 源路径应该存在
    validateAssetFileExists(sourcePath);

    // 目标路径也应该存在
    validateAssetFileExists(destPath);
    validateAssetMetaExists(destPath);
}

/**
 * 验证导入资源结果
 */
export interface ImportAssetResult {
    assets: AssetCreationResult[];
    targetPath: string;
    expectedCount?: number;
}

export function validateImportAssetResult(result: ImportAssetResult): void {
    const { assets, targetPath, expectedCount } = result;

    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThan(0);

    if (expectedCount !== undefined) {
        expect(assets.length).toBe(expectedCount);
    }

    // 验证目标路径存在
    validateAssetFileExists(targetPath);

    // 验证每个资源都有有效的数据
    assets.forEach(asset => {
        expect(asset.uuid).toBeDefined();
        expect(asset.url).toBeDefined();
    });
}

/**
 * 验证资源保存结果
 */
export function validateAssetSaved(filePath: string, expectedContent: string): void {
    validateAssetFileExists(filePath);

    const content = require('fs-extra').readFileSync(filePath, 'utf8');
    expect(content).toBe(expectedContent);
}

/**
 * 验证资源重新导入结果
 */
export function validateAssetReimported(asset: any, expectedChanges?: Record<string, any>): void {
    expect(asset).not.toBeNull();

    if (expectedChanges) {
        Object.keys(expectedChanges).forEach(key => {
            expect(asset[key]).toBe(expectedChanges[key]);
        });
    }
}

/**
 * 比较两个资源的 UUID 是否相同
 */
export function compareAssetUUID(asset1: AssetCreationResult, asset2: AssetCreationResult): void {
    expect(asset1.uuid).toBe(asset2.uuid);
}

/**
 * 验证资源元数据
 */
export function validateAssetMeta(metaPath: string, expectedFields: Record<string, any>): void {
    expect(existsSync(metaPath)).toBe(true);

    const meta = require('fs-extra').readJSONSync(metaPath);

    Object.keys(expectedFields).forEach(key => {
        expect(meta[key]).toBe(expectedFields[key]);
    });
}

/**
 * 生成测试资源路径
 */
export function getTestAssetPath(basePath: string, fileName: string): string {
    return join(basePath, fileName);
}

/**
 * 验证资源重命名结果
 */
export function validateAssetRenamed(
    sourceUrl: string,
    targetUrl: string,
    resultAsset: any
): void {
    expect(resultAsset).not.toBeNull();
    expect(resultAsset.url).toContain(targetUrl.split('/').pop());
    expect(resultAsset.url).not.toBe(sourceUrl);
}

/**
 * 验证查询 UUID 结果
 */
export function validateQueryUUIDResult(uuid: string | null): void {
    if (uuid === null) {
        expect(uuid).toBeNull();
    } else {
        expect(uuid).toBeDefined();
        expect(typeof uuid).toBe('string');
        expect(uuid.length).toBeGreaterThan(0);
    }
}

/**
 * 验证查询路径结果
 */
export function validateQueryPathResult(path: string | null, shouldExist = true): void {
    if (shouldExist) {
        expect(path).toBeDefined();
        expect(typeof path).toBe('string');
        expect(path).not.toBe('');
    } else {
        expect(path).toEqual('');
    }
}

/**
 * 验证查询 URL 结果
 */
export function validateQueryUrlResult(url: string | null, expectedPrefix = 'db://'): void {
    if (url) {
        expect(url).toBeDefined();
        expect(url.startsWith(expectedPrefix)).toBe(true);
    }
}

/**
 * 验证资源元数据结构
 */
export function validateAssetMetaStructure(meta: any): void {
    expect(meta).not.toBeNull();
    expect(meta).toHaveProperty('uuid');
    expect(meta).toHaveProperty('importer');
    expect(meta).toHaveProperty('ver');
}

/**
 * 验证批量查询资源结果
 */
export function validateQueryAssetsResult(assets: any[], minCount = 0): void {
    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThanOrEqual(minCount);

    if (assets.length > 0) {
        assets.forEach(asset => {
            expect(asset).toHaveProperty('uuid');
            expect(asset).toHaveProperty('url');
            expect(asset).toHaveProperty('type');
        });
    }
}

/**
 * 验证创建资源映射表结果
 */
export function validateCreateMapResult(createMap: any[]): void {
    expect(Array.isArray(createMap)).toBe(true);
    expect(createMap.length).toBeGreaterThan(0);

    createMap.forEach(item => {
        if (item.submenu) {
            // 有子菜单的情况
            expect(item).toHaveProperty('label');
            expect(Array.isArray(item.submenu)).toBe(true);
        } else {
            // 没有子菜单的情况
            expect(item).toHaveProperty('handler');
            expect(item).toHaveProperty('fullFileName');
        }
    });
}

/**
 * 验证刷新资源结果
 */
export function validateRefreshResult(code: number): void {
    expect(code).toBe(200);
}

/**
 * 验证资源用户数据更新结果
 */
export function validateUserDataUpdated(
    meta: any,
    path: string,
    expectedValue: any
): void {
    expect(meta).not.toBeNull();
    expect(meta.userData).toBeDefined();

    // 支持嵌套路径（如 'test.nested.value'）
    const keys = path.split('.');
    let current = meta.userData;
    for (const key of keys) {
        current = current[key];
    }
    expect(current).toEqual(expectedValue);
}

