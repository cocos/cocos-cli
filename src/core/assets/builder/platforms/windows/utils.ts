
'use strict';

import { join } from 'path';
import { mkdtemp, writeFile } from 'fs-extra';
import { spawn } from 'child_process';
import * as os from 'os';
import { getCmakePath } from '../native-common/native-utils';

/**
 * 查询当前设备上安装的 visual studio
 * @returns {name: 用于显示,  value: 用于存储}[] 
 */
export async function queryVisualStudioVersion() {

    const cmakePath = await getCmakePath();
    const tmpDir = os.tmpdir();
    const vsVersions = [
        ['-G', '"Visual Studio 17 2022"'], '2022',
        ['-G', '"Visual Studio 16 2019"'], '2019',
        ['-G', '"Visual Studio 15 2017"', '-A', 'x64'], '2017',
        ['-G', '"Visual Studio 14 2015"', '-A', 'x64'], '2015',
    ];
    const testCMake = (cwd: string) => async (G: string[], ver: string): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            const result = spawn(cmakePath, G.concat(`-B build_${ver}`), {
                cwd,
                shell: true,
            });
            result.on('close', (code, signal) => {
                resolve(code == 0);
            });
            return false;
        });
    };

    const dir = await mkdtemp(join(tmpDir, 'cmake-vs'));

    console.log(`Create temp dir ${dir}`);

    const cmakeListFile = join(dir, 'CMakeLists.txt');
    const helloFile = join(dir, 'hello.cpp');
    const helloSrc = `
	#include <iostream>
	int main(int argc, char **argv) {
	std::cout << "hello cocos" << std::endl;
	return 0;
	}
	`;
    const cmakeListSrc = `
	cmake_minimum_required(VERSION 3.8)
	project(hello CXX)
	add_executable(hello hello.cpp)
	`;
    await writeFile(cmakeListFile, cmakeListSrc);
    await writeFile(helloFile, helloSrc);

    const versions = [];
    const tryCmake = testCMake(dir);
    for (let i = 0; i < vsVersions.length; i += 2) {
        const G = <string[]>vsVersions[i];
        const verStr = <string>vsVersions[i + 1];
        if (await tryCmake(G.concat('-S.'), verStr)) {
            versions.push({
                name: `Visual Studio ${verStr}`,
                value: verStr,
            });
        }
    }
    return versions;
}


export function executableNameOrDefault(projectName: string, executableName?: string): string {
    if (executableName) return executableName;
    if (/^[0-9a-zA-Z_-]+$/.test(projectName)) return projectName;
    return 'CocosGame';
}