import type { IBuildCommandOption, IBuildResultData, IBuildStageOptions, IBundleBuildOptions, Platform } from '../../core/builder/@types/private';
import type { BuildConfiguration } from '../../core/builder/@types/config-export';

export type * from '../../core/builder/@types/protected';

export async function init(platform?: string): Promise<void> {
    const builder = await import('../../core/builder');
    return builder.init(platform);
}

export async function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.build(platform, options);
}

export async function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.buildBundleOnly(bundleOptions);
}

export async function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData> {
    const builder = await import('../../core/builder');
    return builder.executeBuildStageTask(taskId, stageName, options);
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
