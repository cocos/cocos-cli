
afterAll(async () => {
    try {
        const { projectManager } = await import('../project-manager');
        await projectManager.close();
    } catch (error) {
        // console.warn('[Worker Teardown] Cleanup failed (possibly already closed):', error.message);
    }
});
