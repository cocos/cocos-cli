import { projectManager } from '../project-manager';

afterAll(async () => {
    try {
        await projectManager.close();
    } catch (error) {
        // console.warn('[Worker Teardown] Cleanup failed (possibly already closed):', error.message);
    }
});
