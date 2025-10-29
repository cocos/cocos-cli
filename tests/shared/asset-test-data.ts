/**
 * 资源测试共享数据
 * 用于单元测试和 E2E 测试复用
 */

/**
 * 创建资源类型的测试用例数据
 */
export const CREATE_ASSET_TYPE_TEST_CASES = [
    { type: 'animation-clip', ext: 'anim', ccType: 'cc.AnimationClip', description: '动画剪辑' },
    { type: 'typescript', ext: 'ts', ccType: 'cc.Script', description: 'TypeScript 脚本' },
    { type: 'auto-atlas', ext: 'pac', ccType: 'cc.SpriteAtlas', description: '自动图集' },
    { type: 'effect', ext: 'effect', ccType: 'cc.EffectAsset', description: '着色器效果' },
    { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: '3d 场景', templateName: '3d' },
    { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: '2d 场景', templateName: '2d' },
    { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: 'quality 场景', templateName: 'quality' },
    { type: 'prefab', ext: 'prefab', ccType: 'cc.Prefab', description: '预制体' },
    { type: 'material', ext: 'mtl', ccType: 'cc.Material', description: '材质' },
    { type: 'terrain', ext: 'terrain', ccType: 'cc.TerrainAsset', description: '地形' },
    { type: 'physics-material', ext: 'pmtl', ccType: 'cc.PhysicsMaterial', description: '物理材质' },
    { type: 'label-atlas', ext: 'labelatlas', ccType: 'cc.LabelAtlas', description: '标签图集' },
    { type: 'effect-header', ext: 'chunk', ccType: '', description: '着色器头文件', skipTypeCheck: true },
] as const;

/**
 * 创建资源类型的测试用例数据（类型定义）
 */
export interface CreateAssetTypeTestCase {
    type: string;
    ext: string;
    ccType: string;
    description: string;
    templateName?: string;
    skipTypeCheck?: boolean;
}

/**
 * 测试文件名生成器
 */
export function generateTestFileName(prefix: string = 'test', suffix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return suffix ? `${prefix}-${timestamp}-${random}.${suffix}` : `${prefix}-${timestamp}-${random}`;
}

/**
 * 生成唯一的资源 URL
 */
export function generateUniqueAssetUrl(baseUrl: string, name: string, ext?: string): string {
    const uniqueName = generateTestFileName(name, ext);
    return `${baseUrl}/${uniqueName}`;
}

/**
 * 测试用的资源内容
 */
export const TEST_ASSET_CONTENTS = {
    text: 'test content for text file',
    script: `import { Component } from 'cc';

export class TestComponent extends Component {
    start() {
        console.log('Test component started');
    }
}`,
    json: JSON.stringify({ test: true, value: 123 }, null, 2),
    updatedText: 'updated test content',
} as const;

/**
 * 常用的查询选项
 */
export const COMMON_QUERY_OPTIONS = {
    // 查询所有资源
    all: {},
    // 查询 assets 数据库资源
    assetsDb: { pattern: 'db://assets/**/*' },
    // 查询 internal 数据库资源
    internalDb: { pattern: 'db://internal/**/*' },
    // 查询场景资源
    scenes: { ccType: 'cc.SceneAsset' },
    // 查询脚本资源
    scripts: { ccType: 'cc.Script' },
    // 查询图片资源
    images: { ccType: 'cc.ImageAsset' },
} as const;

/**
 * 测试用户数据
 */
export const TEST_USER_DATA = {
    simple: { testKey: 'testValue' },
    nested: {
        level1: {
            level2: 'nestedValue'
        }
    },
    array: { items: ['item1', 'item2'] },
    mixed: {
        string: 'value',
        number: 123,
        boolean: true,
        nested: { key: 'value' }
    }
} as const;

