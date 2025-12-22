'use strict';

import { join, normalize } from 'path';
import { existsSync, readFile, writeFile, readJSON, rename } from 'fs-extra';
import { execSync } from 'child_process';
import { ITaskOption } from '../native-common/type';
import { IOptions } from './type'
import { BuildCheckResult } from '../../@types/protected';

/**
 * 修改 ios 的包名
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
        console.error('The package name is illegal(iOS). It can only contain these characters: [0-9], [a-z], [A-Z], [_].');
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
        files = nativeSupport.project_replace_ios_bundleid.files;
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

    if (!json.ios) {
        json.ios = {};
    }
    json.ios.packageName = packageName;
    await writeFile(projectJSONPath, JSON.stringify(json, null, 2));
}

/**
 * 检查 ios 包名的合法性
 * @param packageName 
 */
export function checkPackageNameValidity(packageName: string) {
    // only alphanumeric characters (A–Z, a–z, and 0–9), hyphens (-), and periods (.)
    // refer: https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleidentifier
    return /^[a-zA-Z]+([a-zA-Z0-9-.])+$/.test(packageName);
}

export function executableNameOrDefault(projectName: string, executableName?: string): string {
    if (executableName) return executableName;
    if (/^[0-9a-zA-Z_-]+$/.test(projectName)) return `${projectName}-mobile`;
    console.warn(`The provided project name "${projectName}" is not suitable for use as an executable name. 'CocosGame' is applied instead.`);
    return 'CocosGame';
}

/**
 * 将包名内不合法字段修改成 _
 * @param packageName 
 */
export function modifyPackageName(packageName: string) {
    return packageName;
}

export async function updateXcodeproject(projectPath: string, options: ITaskOption) {
    const root = options.engineInfo.native.builtin;
    const template = (options as any).packages.native.template; // default ｜ link
    const xcodedir = join(projectPath, 'frameworks/runtime-src/proj.ios_mac', `${options.name}.xcodeproj`);

    if (template === 'link' && existsSync(xcodedir)) {

        const projectpbx = join(xcodedir, 'project.pbxproj');
        // replace content
        let txt = (await readFile(projectpbx)).toString();
        // TODO 这个逻辑应该放 engine-native 仓库，不应该在编辑器里 hack，否则耦合严重
        txt = txt.replace(/\/Applications\/CocosCreator.app\/Contents\/Resources\/cocos2d-x/g, normalize(root));
        await writeFile(projectpbx, txt);
    }

    const xcscheme = join(xcodedir, 'xcshareddata/xcschemes/HelloJavascript-clip.xcscheme');
    if (existsSync(xcscheme)) {
        let txt = (await readFile(xcscheme)).toString();
        txt = txt.replace(/HelloJavascript/g, options.name);
        await writeFile(xcscheme, txt);
    }
}

export async function renameXcodeResource(projectPath: string, options: ITaskOption) {
    const renameFiles = [
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', `${options.name}.xcodeproj/xcshareddata/xcschemes/HelloJavascript-clip.xcscheme`),
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', `${options.name}.xcodeproj/xcshareddata/xcschemes/${options.name}-clip.xcscheme`),
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', 'ios/HelloJavascript-mobileRelease.entitlements'),
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', `ios/${options.name}-mobileRelease.entitlements`),
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', 'ios_appclip/HelloJavascript.entitlements'),
        join(projectPath, 'frameworks/runtime-src/proj.ios_mac', `ios_appclip/${options.name}.entitlements`),
    ];

    for (let i = 0; i < renameFiles.length; i += 2) {
        if (existsSync(renameFiles[i])) {
            await rename(renameFiles[i], renameFiles[i + 1]);
        } else {
            console.log(`notice: file ${renameFiles[i]} not found!`);
        }
    }
}

function flatArray(recArray: any, output: any[]) {
    if (recArray instanceof Array) {
        for (const e of recArray) {
            flatArray(e, output);
        }
    } else {
        output.push(recArray);
    }

}

/**
 * 读取证书中的 Organization Unit 字段, 作为 team id 使用. 
 * @param name 证书名称
 * @returns 
 */
function readOrganizationUnits(name: string) {
    const pem = execSync(`xcrun security find-certificate -c "${name}" -p`, { encoding: 'utf8' });
    const text = execSync('openssl x509 -inform PEM -noout -text', { input: pem, encoding: 'utf8' });
    const reg = /OU\s*=\s*(\w+),/;
    const lines = text.split('\n').filter(x => x.match(/^\s*Subject:/)).map(x => x.match(reg)).filter(x => x !== null).map(m => m![1]);
    return lines.length === 0 ? [] : lines;
}

/**
 * 查询可用的 DEVELOPMENT_TEAM  
 * @returns 签名[]
 */
export async function findSignIdentify() {
    try {
        const output = execSync('xcrun security find-identity -v -p codesigning').toString('utf8');
        const lines = output.split('\n');
        const reg = /(\w+\)) ([0-9A-Z]+) "([^"]+)"\s*(\((\w+)\))?/;
        const options = lines.map(l => l.match(reg)).filter(x => x !== null).map(m => {
            const ps = m![3].split(':');
            const teams = readOrganizationUnits(m![3]);
            return teams.map(fv => {
                return {
                    idx: m![1].substr(0, m![1].length - 1),
                    hash: m![2],
                    kind: ps[0],
                    displayValue: ps[1].trim(), // 较短的格式. 也可以用于显示到列表, 相比 fullValue 缺少 kind 字段.
                    outputValue: fv, // 写入到 cfg.cmake DEVELOPMENT_TEAM 字段的内容
                    fullValue: m![3].replace(/\(\w+\)/, `(TEAM:${fv})`), // 完整格式, 显示到选择列表
                    errorState: m![5],
                };
            });
        });
        const list: any[] = [];
        flatArray(options, list);
        return list.filter(x => x.outputValue.length > 0);
    } catch (e) {
        console.warn('ios:' + 'i18n:ios.tips.targetVersionErrorWithTaskFlow');
        console.warn(e);
        return [];
    }
}

export function verificationFunc(key: keyof IOptions, value: any, options: ITaskOption): BuildCheckResult {
    const res: BuildCheckResult = {
        error: '',
        newValue: value,
        level: 'error',
    };
    switch (key) {
        case 'targetVersion': {
            let minVersion = '11.0';
            // 2~3 位，x.x(.x) 的形式，每位 x 的范围分别为 1-99, 0-99, 0-99。
            if (!/^([1-9]\d|[1-9])(\.([1-9]\d|\d)){1,2}$/.test(value)) {
                res.error = 'i18n:ios.tips.version_style_error';
                return res;
            }
            if (options.packages.native.JobSystem === 'taskFlow') {
                minVersion = '12.0';
                if (!compareVersion(value, minVersion)) {
                    res.error = 'i18n:ios.tips.targetVersionErrorWithTaskFlow';
                    res.newValue = minVersion;
                }
            }
            if (!res.error && !compareVersion(value, minVersion)) {
                res.error = 'i18n:ios.tips.targetVersionError';
                res.newValue = minVersion;
            }
        }
            break;
        case 'orientation':
            if (!value) {
                res.error = 'i18n:ios.tips.not_empty';
                return res;
            }
            if (Object.keys(value).every((key) => !value[key])) {
                res.error = 'i18n:ios.tips.at_least_one';
                return res;
            }
            break;
        case 'osTarget':
            if (!value) {
                res.error = 'i18n:ios.tips.not_empty';
                return res;
            }
            if (Object.keys(value).every((key) => !value[key])) {
                res.error = 'i18n:ios.tips.at_least_one';
                return res;
            }
            break;
        case 'packageName':
            if (!value) {
                res.error = 'i18n:ios.tips.not_empty';
                return res;
            }
            if (!checkPackageNameValidity(value)) {
                res.error = 'i18n:ios.tips.packageNameRuleMessage';
                return res;
            }
            break;
        default:
            break;
    }
    return res;
}

/**
 * return result of versionMax > versionMin
 * @param versionOne
 * @param versionTwo
 * @param split
 */
export function compareVersion(versionMax: string, versionMin: string, split = '.') {
    if (typeof versionMax !== 'string' || typeof versionMin !== 'string') {
        return true;
    }
    const padNum = Math.max(versionMax.length, versionMin.length);
    versionMax = versionMax.replace(split, '').padStart(padNum, '0');
    versionMin = versionMin.replace(split, '').padStart(padNum, '0');
    return Number(versionMax) > Number(versionMin) || Number(versionMax) === Number(versionMin);
}