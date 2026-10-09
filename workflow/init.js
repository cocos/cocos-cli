// Compatibility entry point: prepare the CLI using an existing SDK, never fetch/reset/compile an engine.
const { setupDev } = require('./setup-dev');
setupDev({ compileEngine: false, minimalTools: process.env.MINIMAL_DOWNLOAD_TOOLS === 'true' })
    .catch(error => { console.error(error); process.exitCode = 1; });
