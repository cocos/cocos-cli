
export class ProjectLib {
    static async open(projectPath: string): Promise<void> {
        const { projectManager } = await import('../../core/project-manager');
        return await projectManager.open(projectPath);
    }

    static async close(): Promise<void> {
        const { projectManager } = await import('../../core/project-manager');
        return await projectManager.close();
    }
}
