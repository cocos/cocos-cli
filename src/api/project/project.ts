import { tool, param, title, description, result } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType, HttpStatusCode, ProjectPathSchema } from '../base/schema-base';
import z from 'zod';

export class ProjectApi {

    //todo: 实现关闭项目的功能，目前启动 mcp 会默认打开项目
    // @tool('project-open')
    @title('打开 Cocos Creator 项目')
    @description('打开指定路径的 Cocos Creator 项目，初始化项目环境并加载项目配置。项目路径必须是绝对路径，指向包含 project.json 的项目根目录。成功打开后可以进行后续的资源管理、构建等操作。')
    @result(z.boolean().describe('项目打开结果，true 表示成功，false 表示失败'))
    async open(@param(ProjectPathSchema) projectPath: string): Promise<CommonResultType<boolean>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        try {
            const { projectManager } = await import('../../core/project-manager');
            await projectManager.open(projectPath);
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            console.error('open project fail:', e instanceof Error ? e.message : String(e) + ' path: ' + projectPath);
        }

        return {
            code: code,
            data: code === COMMON_STATUS.SUCCESS
        };
    }

    //todo: 实现关闭项目的功能，目前启动 mcp 会默认打开项目
    // @tool('project-close')
    @title('关闭当前 Cocos Creator 项目')
    @description('关闭当前打开的 Cocos Creator 项目，清理项目相关的内存状态和资源。关闭后需要重新打开项目才能进行后续操作。建议在完成所有项目操作后调用此方法释放资源。')
    @result(z.boolean().describe('项目关闭结果，true 表示成功，false 表示失败'))
    async close() {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        try {
            const { projectManager } = await import('../../core/project-manager');
            await projectManager.close();
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            console.error('close project fail:', e instanceof Error ? e.message : String(e));
        }

        return {
            code: code,
            data: code === COMMON_STATUS.SUCCESS
        };
    }
}
