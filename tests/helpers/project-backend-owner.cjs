const { ProjectBackendLease } = require('../../dist/core/project-backend/ownership');
let lease;
process.on('message', async message => {
    try {
        if (message.type === 'acquire') {
            lease = await ProjectBackendLease.acquire(message.project);
            process.send({ id: message.id, value: lease.descriptor });
        } else if (message.type === 'publish') {
            await lease.publish(message.patch);
            process.send({ id: message.id, value: lease.descriptor });
        } else if (message.type === 'release') {
            await lease.release();
            process.send({ id: message.id, value: true });
        }
    } catch (error) { process.send({ id: message.id, error: { code: error.code, message: error.message, backend: error.backend } }); }
});
