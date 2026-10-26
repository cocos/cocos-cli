// Runs in a real editor host process with no CLI project initialization.
const { SceneSessionClient } = require('../../dist/core/scene/session/client');
process.on('message', async ({ id, descriptor, command }) => {
    try {
        const client = new SceneSessionClient(descriptor);
        const value = command ? await client.command(command) : await client.snapshot();
        process.send({ id, value });
    } catch (error) { process.send({ id, error: { code: error.code, message: error.message } }); }
});
