#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function withoutWorkers(args) {
    return args.filter((arg, index) => {
        if (['--maxWorkers', '-w'].includes(args[index - 1])) return false;
        return !/^(--maxWorkers(?:=|$)|-w(?:=|\d|$))/.test(arg);
    });
}

function createPlan(args) {
    if (args.some(arg => /^(--config|--projects|--selectProjects|--ignoreProjects|--filter|--testMatch|--testRegex|--rootDir|-c)(=|$)/.test(arg))) {
        throw new Error('Custom Jest configurations/projects/filters require a direct Jest invocation (npx jest).');
    }
    // A single run preserves interactive watch behavior and combined coverage/JSON reports.
    if (args.some(arg => /^(--watch|--watchAll|--coverage|--collectCoverage|--json|--outputFile|--detectOpenHandles)(=|$)/.test(arg))) {
        return [{ name: 'all (serial)', args: [...withoutWorkers(args), '--config', 'jest.config.ts', '--runInBand'] }];
    }
    return [
        { name: 'parallel', args: [...args, '--config', 'jest.parallel.config.ts', '--passWithNoTests'] },
        { name: 'serial', args: [...withoutWorkers(args), '--config', 'jest.serial.config.ts', '--runInBand', '--passWithNoTests'] },
    ];
}

function run(args, spawn = spawnSync) {
    const plan = createPlan(args);
    // A filtered run can legitimately leave one group empty, but must not hide a
    // typo that matches neither group. Discovery runs no setup hooks or tests.
    const hasPathSelection = args.some((arg, index) =>
        (!arg.startsWith('-') && !['--maxWorkers', '-w'].includes(args[index - 1])) ||
        /^--(testPathPattern|runTestsByPath|findRelatedTests|onlyChanged|changedSince|lastCommit)(=|$)/.test(arg));
    if (plan.length === 2 && hasPathSelection && !args.includes('--passWithNoTests')) {
        const discovery = spawn(process.execPath, [
            require.resolve('jest/bin/jest'), ...withoutWorkers(args),
            '--config', 'jest.config.ts', '--listTests', '--json', '--runInBand',
        ], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: false });
        if (discovery.error) throw discovery.error;
        if (discovery.status !== 0) {
            if (discovery.stderr) console.error(discovery.stderr);
            return discovery.status || 1;
        }
        if (JSON.parse(discovery.stdout).length === 0) {
            console.error('No tests found matching the supplied paths.');
            return 1;
        }
    }
    let exitCode = 0;
    for (const group of plan) {
        console.log(`[unit] ${group.name}`);
        const startedAt = Date.now();
        const result = spawn(process.execPath, [require.resolve('jest/bin/jest'), ...group.args], {
            cwd: root,
            stdio: 'inherit',
            shell: false,
        });
        if (result.error) throw result.error;
        console.log(`[unit] ${group.name}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s, exit ${result.status ?? result.signal}`);
        // Never start another group after cancellation or a process-level failure.
        if (result.signal || result.status === null || result.status > 1) return result.status || 1;
        if (result.status !== 0) exitCode = result.status;
    }
    return exitCode;
}

if (require.main === module) {
    try {
        process.exitCode = run(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { createPlan, run };
