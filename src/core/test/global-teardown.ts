import { projectManager } from '../project-manager';

export default async function globalTeardown() {
    console.log('\n[Global Teardown] Cleaning up resources...');
    try {
        await projectManager.close();
        console.log('[Global Teardown] Cleanup successful.');
    } catch (error) {
        // console.warn('[Global Teardown] Cleanup failed (possibly already closed):', error.message);
    }
}
