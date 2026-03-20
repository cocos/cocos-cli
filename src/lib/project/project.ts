
export async function init(projectPath: string): Promise<void> {
    // 初始化项目信息
    const { default: Project } = await import('../../core/project');
    await Project.open(projectPath);
}

export async function open(projectPath: string): Promise<void> {
    const { projectManager } = await import('../../core/project-manager');
    return await projectManager.open(projectPath);
}

export async function close(): Promise<void> {
    const { projectManager } = await import('../../core/project-manager');
    return await projectManager.close();
}

export async function getInfo() {
    const { default: Project } = await import('../../core/project');
    return await Project.getInfo();
}

export async function get() {
    const { default: Project } = await import('../../core/project');
    return Project;
}