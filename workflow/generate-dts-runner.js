const path = require('node:path');
const { spawn } = require('node:child_process');

const nativeCrashes = new Set([0xc0000374, 0xc0000409]);
async function generate(runOnce, platform = process.platform) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const code = await runOnce();
        if (code === 0) return 0;
        if (platform !== 'win32' || !nativeCrashes.has(code >>> 0) || attempt === 3) return code ?? 1;
        console.error(`[generate-dts] Native process crash 0x${(code >>> 0).toString(16)}; retry ${attempt}/2`);
    }
}

if (require.main === module) {
    const root = path.resolve(__dirname, '..');
    // A native heap failure can terminate all worker threads and their parent.
    // The retry controller must therefore live in a separate process.
    generate(() => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--max-old-space-size=8192', path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'workflow/generate-dts.ts')], { cwd: root, stdio: 'inherit', windowsHide: true });
        child.once('error', reject);
        child.once('close', resolve);
    })).then(code => { process.exitCode = code; }).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { generate };
