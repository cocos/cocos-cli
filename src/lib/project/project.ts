export async function init(projectPath: string): Promise<void> {
    const { ensureProjectOwnership } = await import('../../core/project-backend/ownership');
    await ensureProjectOwnership(projectPath);
    // 初始化项目信息
    const { default: Project } = await import('../../core/project');
    await Project.open(projectPath);

}

export { discoverProjectBackend, ProjectBackendError } from '../../core/project-backend/ownership';
export type { ProjectBackendDescriptor } from '../../core/project-backend/ownership';
export { startProjectBackend, ensureProjectBackend, stopProjectBackend } from '../../core/project-backend/client';
export type { StartProjectBackendOptions } from '../../core/project-backend/client';

export async function open(projectPath: string): Promise<void> {
    const { projectManager } = await import('../../core/project-manager');
    return await projectManager.open(projectPath);
}

export async function close(): Promise<void> {
    const { currentProjectOwnership } = await import('../../core/project-backend/ownership');
    const lease = await currentProjectOwnership();
    if (lease) { await lease.requestShutdown(); return; }
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
