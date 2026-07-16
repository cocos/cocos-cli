'use strict';

import { join } from 'path';
import { ensureDir, pathExists, writeFile } from 'fs-extra';
import { spawn } from 'child_process';
import * as os from 'os';
import { getCmakePath } from '../../native-common/native-utils';

interface VisualStudioVersionInfo {
    name: string;
    value: string;
}

interface VisualStudioProbe {
    args: string[];
    version: string;
}

const CMAKE_TEST_DIR = join(os.tmpdir(), 'cmake-vs');
const CMAKE_PROBE_TIMEOUT = 15000;
const VS_PROBES: VisualStudioProbe[] = [
    { args: ['-G', 'Visual Studio 17 2022'], version: '2022' },
    { args: ['-G', 'Visual Studio 16 2019'], version: '2019' },
    { args: ['-G', 'Visual Studio 15 2017', '-A', 'x64'], version: '2017' },
    { args: ['-G', 'Visual Studio 14 2015', '-A', 'x64'], version: '2015' },
];

const HELLO_CPP_SOURCE = `
#include <iostream>
int main(int argc, char **argv) {
    std::cout << "hello cocos" << std::endl;
    return 0;
}
`;

const CMAKE_LIST_SOURCE = `
cmake_minimum_required(VERSION 3.8)
project(hello CXX)
add_executable(hello hello.cpp)
`;

async function writeFileIfAbsent(file: string, content: string): Promise<void> {
    if (!await pathExists(file)) {
        await writeFile(file, content);
    }
}

async function prepareCMakeProbeProject(): Promise<string> {
    await ensureDir(CMAKE_TEST_DIR);
    await writeFileIfAbsent(join(CMAKE_TEST_DIR, 'CMakeLists.txt'), CMAKE_LIST_SOURCE);
    await writeFileIfAbsent(join(CMAKE_TEST_DIR, 'hello.cpp'), HELLO_CPP_SOURCE);
    return CMAKE_TEST_DIR;
}

function testCMake(
    cmakePath: string,
    cwd: string,
    probe: VisualStudioProbe,
    callback: (success: boolean) => void,
): void {
    const cmakeArgs = [...probe.args, '-S', '.', '-B', `build_${probe.version}`];
    console.log(`Test cmake ${cmakeArgs.join(' ')} ${cwd}`);

    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (success: boolean) => {
        if (finished) {
            return;
        }
        finished = true;
        if (timer) {
            clearTimeout(timer);
        }
        callback(success);
    };

    const child = spawn(cmakePath, cmakeArgs, {
        cwd,
        windowsHide: true,
    });

    timer = setTimeout(() => {
        console.warn(`Test cmake timeout ${cmakeArgs.join(' ')} ${cwd}`);
        child.kill();
        done(false);
    }, CMAKE_PROBE_TIMEOUT);

    child.stdout?.on('data', (data) => {
        console.log(String(data));
    });
    child.stderr?.on('data', (data) => {
        console.warn(String(data));
    });
    child.on('error', (error) => {
        console.warn(`Failed to start cmake ${cmakeArgs.join(' ')} ${cwd}: ${error.message}`);
        done(false);
    });
    child.on('close', (code, signal) => {
        console.log(`CMake process closed for Visual Studio ${probe.version}: code=${code}, signal=${signal ?? ''}`);
        done(code === 0);
    });
}

function queryVisualStudioProbe(
    cmakePath: string,
    cwd: string,
    probe: VisualStudioProbe,
): Promise<VisualStudioVersionInfo | undefined> {
    return new Promise((resolve) => {
        testCMake(cmakePath, cwd, probe, (success) => {
            if (!success) {
                resolve(undefined);
                return;
            }
            resolve({
                name: `Visual Studio ${probe.version}`,
                value: probe.version,
            });
        });
    });
}

/**
 * Query installed Visual Studio versions by testing CMake generators.
 */
export async function queryVisualStudioVersion(): Promise<VisualStudioVersionInfo[]> {
    const cmakePath = await getCmakePath();
    if (!cmakePath || !await pathExists(cmakePath)) {
        console.warn(`CMake executable not found: ${cmakePath}`);
        return [];
    }

    const dir = await prepareCMakeProbeProject();
    console.log(`Use cmake temp dir ${dir}`);

    const versions = await Promise.all(VS_PROBES.map((probe) => queryVisualStudioProbe(cmakePath, dir, probe)));
    return versions.filter((item): item is VisualStudioVersionInfo => !!item);
}

export function executableNameOrDefault(projectName: string, executableName?: string): string {
    if (executableName) return executableName;
    if (/^[0-9a-zA-Z_-]+$/.test(projectName)) return projectName;
    return 'CocosGame';
}
