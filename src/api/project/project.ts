import { tool, param, title, description, result } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType, HttpStatusCode, SchemaProjectPath } from '../base/schema-base';
import z from 'zod';

export class ProjectApi {

    //todo: Implement the function to close the project. Currently, starting mcp will open the project by default // 实现关闭项目的功能，目前启动 mcp 会默认打开项目
    // @tool('project-open')
    @title('Open Cocos Creator Project') // 打开 Cocos Creator 项目
    @description('Open the Cocos Creator project at the specified path, initialize the project environment and load the project configuration. The project path must be an absolute path pointing to the project root directory containing project.json. After successful opening, subsequent resource management, build and other operations can be performed.') // 打开指定路径的 Cocos Creator 项目，初始化项目环境并加载项目配置。项目路径必须是绝对路径，指向包含 project.json 的项目根目录。成功打开后可以进行后续的资源管理、构建等操作。
    @result(z.boolean().describe('Project open result, true means success, false means failure')) // 项目打开结果，true 表示成功，false 表示失败
    async open(@param(SchemaProjectPath) projectPath: string): Promise<CommonResultType<boolean>> {
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

    //todo: Implement the function to close the project. Currently, starting mcp will open the project by default // 实现关闭项目的功能，目前启动 mcp 会默认打开项目
    // @tool('project-close')
    @title('Close Current Cocos Creator Project') // 关闭当前 Cocos Creator 项目
    @description('Close the currently opened Cocos Creator project, clean up project-related memory status and resources. After closing, you need to reopen the project to perform subsequent operations. It is recommended to call this method to release resources after completing all project operations.') // 关闭当前打开的 Cocos Creator 项目，清理项目相关的内存状态和资源。关闭后需要重新打开项目才能进行后续操作。建议在完成所有项目操作后调用此方法释放资源。
    @result(z.boolean().describe('Project close result, true means success, false means failure')) // 项目关闭结果，true 表示成功，false 表示失败
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
