
export class Project {
    static async init(projectPath: string): Promise<void> {
        // 初始化项目信息
        const { default: Project } = await import('../../core/project');
        await Project.open(projectPath);
    }

    static async open(projectPath: string): Promise<void> {
        const { projectManager } = await import('../../core/project-manager');
        return await projectManager.open(projectPath);
    }

    static async close(): Promise<void> {
        const { projectManager } = await import('../../core/project-manager');
        return await projectManager.close();
    }
}
