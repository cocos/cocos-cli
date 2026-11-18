const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const rootRequire = createRequire(path.join(__dirname, '../package.json'));
// https://forum.cocos.org/t/topic/178069: old Terser negates only the RHS of ??.
// Exercise consumers as well as minification: Terser 5's async API requires
// upgrading their plugins, and rollup-plugin-terser 7 requires Rollup 2.
const sources = [
    'function repro(p,o,g){const f=p.findOnMoving??(o==null?void 0:o.findOnMoving)??false;if(!f&&g.moving)return false;return true;}',
    'function repro(p,o,g){const f=p.findOnMoving??false;if(!f&&g.moving)return false;return true;}',
    'function repro(p,o,g){let calls=0;function a(){calls++;return p.findOnMoving;}function b(){calls+=10;return o==null?undefined:o.findOnMoving;}return [!(a()??b()??false),calls];}',
];

function verify(code, source) {
    const expected = vm.runInNewContext(source + ';repro');
    const exports = {};
    vm.runInNewContext(code, { exports, module: { exports } });
    const values = [undefined, null, false, true, 0, 1, '', 'x'];
    for (const p of values) {
        for (const o of [undefined, null, ...values.map(findOnMoving => ({ findOnMoving }))]) {
            for (const moving of [false, true]) {
                const args = [{ findOnMoving: p }, o, { moving }];
                assert.equal(JSON.stringify(exports.repro(...args)), JSON.stringify(expected(...args)));
            }
        }
    }
}

for (const owner of [null, '@cocos/build-polyfills', '@cocos/transform-utilities']) {
    test(`release compression preserves nullish semantics: ${owner || 'main scripts'}`, async () => {
        const localRequire = owner ? createRequire(rootRequire.resolve(owner + '/package.json')) : rootRequire;
        const { rollup } = localRequire('rollup');
        const { terser } = localRequire('rollup-plugin-terser');
        for (const source of sources) {
            const bundle = await rollup({
                input: 'repro',
                plugins: [
                    { name: 'fixture', resolveId: id => id === 'repro' ? id : null,
                        load: id => id === 'repro' ? source + '\nexport { repro };' : null },
                    terser({ numWorkers: 1, compress: { passes: 2 } }),
                ],
            });
            try {
                const { output } = await bundle.generate({ format: 'cjs', sourcemap: true });
                assert.ok(output[0].map);
                verify(output[0].code, source);
            } finally {
                await bundle.close();
            }
        }
    });
}

test('webpack production compression preserves nullish semantics', async () => {
    const webpack = rootRequire('webpack');
    const localRequire = createRequire(rootRequire.resolve('webpack'));
    const TerserPlugin = localRequire('terser-webpack-plugin');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-terser-'));
    try {
        // Webpack 4's parser needs the ?? fixture injected after parsing.
        const compiler = webpack({ mode: 'production', entry: path.join(dir, 'input.js'),
            output: { path: dir, filename: 'output.js', hashFunction: 'sha256' },
            optimization: { minimizer: [new TerserPlugin({ parallel: false, extractComments: false })] },
            plugins: [{ apply(compiler) {
                compiler.hooks.compilation.tap('fixture', compilation => {
                    compilation.hooks.optimizeChunkAssets.tap({ name: 'fixture', stage: -100 }, () => {
                        const { RawSource } = localRequire('webpack-sources');
                        compilation.assets['output.js'] = new RawSource(sources[0] + ';exports.repro=repro;');
                    });
                });
            } }],
        });
        fs.writeFileSync(path.join(dir, 'input.js'), 'module.exports = {};');
        await new Promise((resolve, reject) => compiler.run((error, stats) => {
            if (error) reject(error);
            else if (stats.hasErrors()) reject(new Error(stats.toString('errors-only')));
            else resolve();
        }));
        const code = fs.readFileSync(path.join(dir, 'output.js'), 'utf8');
        assert.ok(!code.includes('const f='), 'fixture must actually pass through the minimizer');
        verify(code, sources[0]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('build-polyfills release API works with the upgraded Rollup stack', async () => {
    const buildPolyfills = rootRequire('@cocos/build-polyfills').default;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-polyfills-'));
    try {
        const file = path.join(dir, 'polyfills.js');
        assert.equal(await buildPolyfills({ file, debug: false, asyncFunctions: true, sourceMap: true }), true);
        const context = vm.createContext({});
        vm.runInContext(fs.readFileSync(file, 'utf8'), context);
        assert.equal(vm.runInContext('typeof regeneratorRuntime.wrap', context), 'function');
        assert.ok(fs.existsSync(file + '.map'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
