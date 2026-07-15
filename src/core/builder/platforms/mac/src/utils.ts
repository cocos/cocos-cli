'use strict';

import { join } from 'path';
import { existsSync, readJSON, readFile, writeFile } from 'fs-extra';

/**
 * 修改 android 的包名
 * @param projectPath 
 * @param packageName 
 */
export async function changePackageName(projectPath: string, packageName: string) {
    const projectJSONPath = join(projectPath, '.cocos-project.json');
    if (!existsSync(projectJSONPath)) {
        console.error(`Can't find project json [${projectJSONPath}]`);
        return;
    }
    const json = await readJSON(projectJSONPath);
    packageName = packageName || json.packageName;

    if (!checkPackageNameValidity(packageName)) {
        console.error('The package name is illegal(MAC). It can only contain these characters: [0-9], [a-z], [A-Z], [_].');
        // packageName = modifyPackageName(packageName);
        return;
    }

    let lastPackageName = json.packageName;
    if (json.mac && json.mac.packageName) {
        lastPackageName = json.mac.packageName;
    }

    const packageNameChanged = lastPackageName !== packageName;

    if (!packageNameChanged) {
        return;
    }

    const templateJsonPath = join(projectPath, 'cocos-project-template.json');
    if (!existsSync(templateJsonPath)) {
        console.error(`Can't find template json [${templateJsonPath}]`);
        return;
    }
    const templateJson = await readJSON(templateJsonPath);
    const nativeSupport = templateJson.do_add_native_support;

    let files: string[];

    if (packageNameChanged) {
        files = nativeSupport.project_replace_mac_bundleid.files;
        for (const file of files) {
            const path = join(projectPath, file);
            if (!existsSync(path)) {
                console.error(`Can't not find file [${file}], replace package name failed`);
                continue;
            }

            let content = await readFile(path, 'utf8');
            content = content.replace(new RegExp(lastPackageName, 'gm'), packageName);
            await writeFile(path, content);
        }
    }

    if (!json.mac) {
        json.mac = {};
    }
    json.mac.packageName = packageName;
    await writeFile(projectJSONPath, JSON.stringify(json, null, 2));
}

/**
 * 检查 mac 包名的合法性
 * @param packageName 
 */
export function checkPackageNameValidity(packageName: string) {
    // refer: https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleidentifier
    return /^[a-zA-Z]+([a-zA-Z0-9-.])+$/.test(packageName);
}

/**
 * 将包名内不合法字段修改成 _
 * @param packageName 
 */
export function modifyPackageName(packageName: string) {
    return packageName;
}

export function executableNameOrDefault(projectName: string, executableName?: string): string {
    if (executableName) return executableName;
    if (/^[0-9a-zA-Z_-]+$/.test(projectName)) return `${projectName}-desktop`;
    return 'CocosGame';
}
