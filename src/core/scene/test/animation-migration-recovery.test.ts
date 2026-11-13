/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

it('runs migration recovery regressions with an isolated real engine', () => {
    // 引擎初始化会改变全局模块解析，独立进程避免污染其他测试
    const rootPath = resolve(__dirname, '../../../..');
    const result = spawnSync(process.execPath, [
        require.resolve('jest/bin/jest'),
        '--config', resolve(rootPath, 'jest.config.ts'),
        '--runInBand',
        '--testMatch', '**/animation-migration-recovery.engine-test.ts',
        '--silent',
    ], {
        cwd: rootPath,
        encoding: 'utf8',
        timeout: 90_000,
        maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
        throw new Error([
            result.error?.message ?? `Engine tests exited with status ${result.status}.`,
            result.stdout,
            result.stderr,
        ].join('\n'));
    }
}, 100_000);
