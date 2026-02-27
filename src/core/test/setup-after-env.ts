import { projectManager } from '../project-manager';

afterAll(async () => {
    // console.log(`\n[Worker Teardown] Cleaning up resources for worker ${process.pid}...`);
    try {
        await projectManager.close();
    } catch (error) {
        // Silently ignore "No project is open" errors as not all tests open a project
        if (!(error instanceof Error && error.message === 'No project is open')) {
            console.error(`[Worker Teardown] Failed to close project:`, error);
        }
    }
});
