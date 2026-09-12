const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlan, run } = require('./test');

test('runs both groups sequentially and retains a failure from the first group', () => {
    const calls = [];
    const status = run(['--silent', '--maxWorkers', '4', '--testNamePattern=schema'], (_exe, args, options) => {
        calls.push(args);
        assert.equal(options.shell, false);
        return { status: calls.length === 1 ? 1 : 0 };
    });
    assert.equal(status, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes('jest.parallel.config.ts'));
    assert.ok(calls[0].includes('4'));
    assert.ok(calls[1].includes('jest.serial.config.ts'));
    assert.ok(calls[1].includes('--runInBand'));
    assert.ok(!calls[1].includes('--maxWorkers'));
    assert.ok(!calls[1].includes('4'));
    assert.ok(calls.every(args => args.includes('--testNamePattern=schema') && args.includes('--silent')));
});

test('a path matching neither group fails without running tests', () => {
    let calls = 0;
    assert.equal(run(['nonexistent.test.ts'], (_exe, args) => {
        calls++;
        assert.ok(args.includes('--listTests'));
        return { status: 0, stdout: '[]' };
    }), 1);
    assert.equal(calls, 1);
});

test('a path matching one group can still run both phases', () => {
    const calls = [];
    assert.equal(run(['schema'], (_exe, args) => {
        calls.push(args);
        return { status: 0, stdout: '["/repo/tests/schema.test.ts"]' };
    }), 0);
    assert.equal(calls.length, 3);
    assert.ok(calls[0].includes('--listTests'));
    assert.ok(calls[1].includes('jest.parallel.config.ts'));
    assert.ok(calls[2].includes('--runInBand'));
});

test('does not continue after interruption', () => {
    let calls = 0;
    assert.equal(run([], () => {
        calls++;
        return { status: null, signal: 'SIGINT' };
    }), 1);
    assert.equal(calls, 1);
});

test('worker aliases never leak into the serial invocation', () => {
    for (const args of [['--maxWorkers=4'], ['-w', '4'], ['-w=4'], ['-w4']]) {
        const plan = createPlan(args);
        assert.deepEqual(plan[1].args, ['--config', 'jest.serial.config.ts', '--runInBand', '--passWithNoTests']);
    }
});

test('coverage, JSON, watch and handle diagnostics keep one complete run', () => {
    for (const flag of ['--coverage', '--json', '--outputFile=report.json', '--watchAll', '--detectOpenHandles']) {
        const plan = createPlan([flag, '--maxWorkers=4']);
        assert.equal(plan.length, 1);
        assert.ok(plan[0].args.includes('jest.config.ts'));
        assert.ok(plan[0].args.includes('--runInBand'));
        assert.ok(plan[0].args.includes(flag));
        assert.ok(!plan[0].args.includes('--maxWorkers=4'));
    }
});

test('rejects options that could replace the partition', () => {
    for (const flag of ['--config=custom.js', '-c', '--projects', '--filter=custom.js', '--testMatch=**/*.ts', '--testRegex=test', '--rootDir=elsewhere']) {
        assert.throws(() => createPlan([flag]), /direct Jest invocation/);
    }
});

function e2eArgs(args) {
    const calls = [];
    const env = {};
    const entry = path.resolve(__dirname, '../e2e/scripts/prepare-test.js');
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
        require: name => name === 'child_process' ? {
            spawn: (_exe, forwarded) => { calls.push(forwarded); return { on() {} }; },
        } : name === 'fs' ? { existsSync: () => true } : require(name),
        __dirname: path.dirname(entry),
        process: { argv: ['node', entry, ...args], env, platform: process.platform, cwd: () => process.cwd() },
        console: { log() {}, error() {} },
    });
    return { args: calls[0], env };
}

test('E2E preserves the first Jest flag without --cli', () => {
    const result = e2eArgs(['--listTests', '--skip-mcp-types']);
    assert.ok(result.args.includes('--listTests'));
    assert.ok(!result.args.includes('--skip-mcp-types'));
});

test('E2E consumes wrapper-only options and keeps the requested test pattern', () => {
    const result = e2eArgs(['--cli', './custom-cli.js', '--preserve', '--skip-mcp-types', '--testPathPattern', 'scene']);
    assert.ok(result.env.E2E_CLI_PATH.endsWith('custom-cli.js'));
    assert.equal(result.env.E2E_DEBUG, 'true');
    assert.ok(result.args.includes('--runInBand'));
    assert.ok(result.args.includes('--detectOpenHandles'));
    assert.ok(!result.args.includes('--preserve'));
    assert.ok(!result.args.includes('--cli'));
    assert.ok(result.args.includes('scene'));
});
