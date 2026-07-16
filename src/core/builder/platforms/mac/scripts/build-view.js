const ps = require('path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const viewOptions = {
    entryPoints: [ps.join(__dirname, '../src/view/build-config.tsx')],
    outfile: ps.join(__dirname, '../dist/view/build-config.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-dom/client',
        'react/compiler-runtime',
        '@pink/ui-kit',
    ],
    logLevel: 'info',
};

const hostOptions = {
    entryPoints: [ps.join(__dirname, '../src/view/build-config-host.ts')],
    outfile: ps.join(__dirname, '../dist/view/build-config-host.js'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'info',
};

const allOptions = [viewOptions, hostOptions];

(async function buildView() {
    try {
        if (watch) {
            for (const options of allOptions) {
                const ctx = await esbuild.context(options);
                await ctx.rebuild();
                await ctx.watch();
            }
            console.log('[mac build-view] watching src/view for changes...');
        } else {
            console.time('Bundle Mac View');
            await Promise.all(allOptions.map((options) => esbuild.build(options)));
            console.timeEnd('Bundle Mac View');
            process.exit(0);
        }
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}());
