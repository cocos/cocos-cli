import { ApiBase } from '../base/api-base';
import { description, param, result, title, tool } from '../decorator/decorator';
import { z } from 'zod';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';

// Schema 定义
const SchemaProjectPath = z.string().min(1).describe('项目路径');
export type TProjectPath = z.infer<typeof SchemaProjectPath>;

// TODO 接口定义？
const SchemaMigrateResult = z.record(z.string(), z.any()).describe('迁移结果');
export type TMigrateResult = z.infer<typeof SchemaMigrateResult>;

export class ConfigurationApi extends ApiBase {
    constructor(
        private projectPath: string,
    ) {
        super();
    }
    async init(): Promise<void> {
        const { configurationManager } = await import('../../core/configuration');
        await configurationManager.initialize(this.projectPath);
    }

    @tool('configuration-migrate-from-project')
    @title('配置迁移')
    @description('从指定项目路径迁移配置到当前项目')
    @result(SchemaMigrateResult)
    async migrateFromProject(@param(SchemaProjectPath) projectPath: TProjectPath): Promise<CommonResultType<TMigrateResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TMigrateResult> = {
            code: code,
            data: {},
        };

        try {
            const { configurationManager } = await import('../../core/configuration/index');
            const result = await configurationManager.migrateFromProject(projectPath);
            ret.data = result;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('配置迁移失败:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
