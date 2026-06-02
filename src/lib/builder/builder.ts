import type { IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBuildTaskOption, IBundleBuildOptions, IPackOptions, IPreviewSettingsResult, Platform, PreviewPackResult } from '../../core/builder/@types/private';
import type { BuildConfiguration } from '../../core/builder/@types/config-export';

export type * from '../../core/builder/@types/private';
export type * from '../../core/builder/@types/config-export';

export async function init(platform?: string): Promise<void> {
    const builder = await import('../../core/builder');
    return builder.init(platform);
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.build(platform, options);
}

export async function createBuildTask<P extends Platform>(platform: P, options?: IBuildCommandOption) {
    const builder = await import('../../core/builder');
    return builder.createBuildTask(platform, options);
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.buildBundleOnly(bundleOptions);
}

export async function createBundleBuildTask(bundleOptions: IBundleBuildOptions) {
    const builder = await import('../../core/builder');
    return builder.createBundleBuildTask(bundleOptions);
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.executeBuildStageTask(taskId, stageName, options);
}

export async function createBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions) {
    const builder = await import('../../core/builder');
    return builder.createBuildStageTask(taskId, stageName, options);
}

export async function make(platform: Platform, dest: string) {
    const { default: Launcher } = await import('../../core/launcher');
    return Launcher.make(platform, dest);
}

export async function run(platform: Platform, dest: string) {
    const { default: Launcher } = await import('../../core/launcher');
    return Launcher.run(platform, dest);
}

export async function queryBuildConfig(): Promise<BuildConfiguration> {
    const builder = await import('../../core/builder');
    return builder.queryBuildConfig();
}

export async function queryDefaultBuildConfigByPlatform(platform: Platform) {
    const builder = await import('../../core/builder');
    return builder.queryDefaultBuildConfigByPlatform(platform);
}

// 获取分包配置
export async function queryBundleConfig() {
    const builder = await import('../../core/builder');
    return builder.queryBundleConfig();
}

// 获取纹理压缩配置
export async function queryTextureCompressConfig() {
    const builder = await import('../../core/builder');
    return builder.queryTextureCompressConfig();
}

// 查询指定 Bundle 中实际会被打包的资源列表
export async function queryAssetsInBundle(uuid: string, bundleFilterConfig?: import('../../core/builder/@types').BundleFilterConfig[]) {
    const builder = await import('../../core/builder');
    return builder.queryAssetsInBundle(uuid, bundleFilterConfig);
}

// 获取注册的平台
export async function getRegisteredPlatforms() {
    const builder = await import('../../core/builder');
    return builder.getRegisteredPlatforms();
}

export async function getPreviewSettings<P extends Platform>(options?: IBuildTaskOption<P>): Promise<IPreviewSettingsResult> {
    const builder = await import('../../core/builder');
    return builder.getPreviewSettings(options);
}

export async function packAutoAtlas(pacUuid: string, option?: Partial<IPackOptions>): Promise<PreviewPackResult | null> {
    const texturePacker = await import('../../core/builder/worker/builder/asset-handler/texture-packer');
    return texturePacker.packAutoAtlas(pacUuid, option);
}

export async function queryAutoAtlasFileCache(pacUuid: string): Promise<PreviewPackResult | null> {
    const texturePacker = await import('../../core/builder/worker/builder/asset-handler/texture-packer');
    return texturePacker.queryAutoAtlasFileCache(pacUuid);
}

export { pluginManager } from '../../core/builder/manager/plugin';
