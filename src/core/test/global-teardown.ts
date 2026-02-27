import { projectManager } from '../project-manager';

export default async function globalTeardown() {
    console.log('\n[Global Teardown] Closing project and cleaning up resources...');
    try {
        await projectManager.close();
        console.log('[Global Teardown] Success.');
    } catch (error) {
        // If no project was open, close() might throw 'No project is open'
        if (error instanceof Error && error.message === 'No project is open') {
            console.log('[Global Teardown] No active project to close.');
            return;
        }
        console.error('[Global Teardown] Failed:', error);
    }
}
