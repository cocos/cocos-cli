import { z } from 'zod';
import { join, resolve } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { SchemaBuildBaseOption, SchemaKnownBuildOptions, SchemaOtherPlatformBuildOption } from '../../api/builder/schema';

export class BuilderHook {
    private dynamicPlatforms: string[] = [];

    constructor() {
        this.scanPlatformPackages();
    }

    /**
     * 扫描 packages/platforms 目录下的平台插件
     */
    private scanPlatformPackages() {
        const platforms: string[] = [];
        const platformsDir = resolve(__dirname, '../../../packages/platforms');

        if (!existsSync(platformsDir)) {
            this.dynamicPlatforms = platforms;
            return;
        }

        try {
            const dirs = readdirSync(platformsDir);
            for (const dir of dirs) {
                const pkgJsonPath = join(platformsDir, dir, 'package.json');
                if (existsSync(pkgJsonPath)) {
                    try {
                        const pkgContent = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
                        // 检查是否是平台插件 (contributes.builder.register === true)
                        if (pkgContent?.contributes?.builder?.register === true) {
                            // 优先使用 contributes.builder.platform，如果没有则使用 package.name
                            const platformName = pkgContent.contributes.builder.platform || pkgContent.name;
                            if (platformName) {
                                platforms.push(platformName);
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to parse package.json for ${dir}:`, e);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to scan platform packages:', e);
        }

        this.dynamicPlatforms = platforms;
    }

    public onRegisterParam(toolName: string, param: any, inputSchemaFields: Record<string, any>) {
        if (toolName !== 'builder-build') return;

        const knownPlatforms = ['web-desktop', 'web-mobile', 'android', 'ios', 'windows', 'mac', 'ohos', 'harmonyos-next', 'google-play'];
        // 合并去重
        const allPlatforms = Array.from(new Set([...knownPlatforms, ...this.dynamicPlatforms]));
        const platformDesc = `Platform Identifier (e.g., ${allPlatforms.join(', ')})`;

        if (param.name === 'options') {
            inputSchemaFields[param.name] = z.any();

            // 动态构建 SchemaBuildOption
            const dynamicSchemas = this.dynamicPlatforms.map(platform => {
                return SchemaBuildBaseOption.extend({
                    platform: z.literal(platform).describe('Build platform'),
                    packages: z.object({
                        [platform]: z.any().optional().describe(`${platform} platform specific configuration`)
                    }).optional().describe(`${platform} platform specific configuration`)
                }).describe(`${platform} complete build options`);
            });

            const newSchema = z.discriminatedUnion('platform', [
                ...SchemaKnownBuildOptions,
                ...dynamicSchemas,
                SchemaOtherPlatformBuildOption
            ] as any).default({}).describe('Build options (with platform preprocessing)');

            // 更新原始 meta 中的 schema，以便 list handler 使用
            param.schema = newSchema;

        } else if (param.name === 'platform') {
            // 动态更新 platform 参数的描述，包含扫描到的平台
            const newPlatformSchema = param.schema.describe(platformDesc);
            inputSchemaFields[param.name] = newPlatformSchema;
            param.schema = newPlatformSchema;
        }
    }

    public onBeforeExecute(toolName: string, args: any) {
        if (toolName !== 'builder-build') return;

        if (!args.options) {
            args.options = {};
        }

        // 处理 configPath
        let options = args.options;
        if (options.configPath) {
            const configPath = options.configPath;
            if (existsSync(configPath)) {
                try {
                    const fileContent = JSON.parse(readFileSync(configPath, 'utf-8'));
                    // 合并配置，args.options 优先级高于配置文件
                    options = args.options = {
                        ...fileContent,
                        ...options
                    };

                    // 删除 configPath 字段
                    delete options.configPath;
                } catch (e) {
                    console.warn(`Failed to load config file: ${configPath}`, e);
                }
            }
        }

        if (typeof options === 'object') {
            if (!options.platform) {
                // 注入 platform
                options.platform = args.platform;
            }

            // sourceMaps exported by CocosEditor is a string, so need to convert it to boolean
            if (options.sourceMaps && typeof options.sourceMaps !== 'boolean') {
                if (options.sourceMaps === 'true') {
                    options.sourceMaps = true;
                } else if (options.sourceMaps === 'false') {
                    options.sourceMaps = false;
                }
            }
        }
    }

    public onValidationFailed(toolName: string, paramName: string, error: any) {
        if (toolName === 'builder-build') {
            throw new Error(`Parameter validation failed for ${paramName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
