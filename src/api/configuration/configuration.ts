import { description, param, result, title, tool } from '../decorator/decorator';
import { z } from 'zod';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/schema-base';

// TODO 接口定义？
const SchemaMigrateResult = z.record(z.string(), z.any()).describe('迁移结果');
export type TMigrateResult = z.infer<typeof SchemaMigrateResult>;

const SchemaReloadResult = z.object({
    success: z.boolean().describe('重新加载是否成功'),
    message: z.string().describe('操作结果消息')
}).describe('重新加载配置结果');
export type TReloadResult = z.infer<typeof SchemaReloadResult>;

export class ConfigurationApi {

    @tool('configuration-remigrate')
    @title('重新迁移配置')
    @description('从当前项目的 settings 目录重新迁移生成 cocos.config.json')
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
            console.error('配置迁移失败:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    // @tool('configuration-reload')
    @title('重新加载配置')
    @description('从硬盘的配置文件重新加载配置，用于刷新配置状态')
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
                message: '配置重新加载成功'
            };
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('配置重新加载失败:', errorMessage);
            ret.data = {
                success: false,
                message: `配置重新加载失败: ${errorMessage}`
            };
            ret.reason = errorMessage;
        }

        return ret;
    }
}
