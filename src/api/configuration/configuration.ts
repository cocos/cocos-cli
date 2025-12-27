import { description, param, result, title, tool } from '../decorator/decorator';
import { z } from 'zod';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/schema-base';

// TODO Interface definition? // 接口定义？
const SchemaMigrateResult = z.record(z.string(), z.any()).describe('Migration result'); // 迁移结果
export type TMigrateResult = z.infer<typeof SchemaMigrateResult>;

const SchemaReloadResult = z.object({
    success: z.boolean().describe('Whether reload is successful'), // 重新加载是否成功
    message: z.string().describe('Operation result message') // 操作结果消息
}).describe('Reload configuration result'); // 重新加载配置结果
export type TReloadResult = z.infer<typeof SchemaReloadResult>;

export class ConfigurationApi {

    @tool('configuration-remigrate')
    @title('Re-migrate configuration') // 重新迁移配置
    @description('Re-migrate and generate cocos.config.json from the settings directory of the current project') // 从当前项目的 settings 目录重新迁移生成 cocos.config.json
    @result(SchemaMigrateResult)
    async migrateFromProject(): Promise<CommonResultType<TMigrateResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TMigrateResult> = {
            code: code,
            data: {},
        };

        try {
            const project = await import('../../core/project/index');
            const { configurationManager } = await import('../../core/configuration/index');
            const result = await configurationManager.migrateFromProject(project.default.path);
            ret.data = result;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('Configuration migration failed:', e instanceof Error ? e.message : String(e)); // 配置迁移失败:
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    // @tool('configuration-reload')
    @title('Reload configuration') // 重新加载配置
    @description('Reload configuration from the configuration file on the disk, used to refresh the configuration status') // 从硬盘的配置文件重新加载配置，用于刷新配置状态
    @result(SchemaReloadResult)
    async reload(): Promise<CommonResultType<TReloadResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TReloadResult> = {
            code: code,
            data: {
                success: false,
                message: ''
            },
        };

        try {
            const { configurationManager } = await import('../../core/configuration/index');
            await configurationManager.reload();
            ret.data = {
                success: true,
                message: 'Configuration reloaded successfully' // 配置重新加载成功
            };
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('Configuration reload failed:', errorMessage); // 配置重新加载失败:
            ret.data = {
                success: false,
                message: `Configuration reload failed: ${errorMessage}` // 配置重新加载失败: ${errorMessage}
            };
            ret.reason = errorMessage;
        }

        return ret;
    }
}
