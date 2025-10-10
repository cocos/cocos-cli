import { basename, isAbsolute, join, normalize, relative } from 'path';
import * as textureCompressConfig from '../share/texture-compress';
import i18n from '../../base/i18n';
import Utils from '../../base/utils';
import { IBuildTaskOption, IConfigItem, IDisplayOptions } from '../@types';
import lodash from 'lodash';
import { BuildGlobalInfo } from './builder-config';
export function compareNumeric(lhs: string, rhs: string): number {
    return lhs.localeCompare(rhs, 'en', { numeric: true });
}

export { compareNumeric as compareUUID };

/**
 * 解析配置 options 内的默认值
 * @param options
 */
export function getOptionsDefault(options: IDisplayOptions) {
    const result: Record<string, any> = {};
    Object.keys(options).forEach((key) => {
        result[key] = options[key].default;
    });
    return result;
}

export function checkCompressOptions(configs: any): boolean {
    if (!configs || typeof configs !== 'object' || Array.isArray(configs)) {
        console.error(i18n.t('builder.project.texture_compress.tips.require_object'));
        return false;
    }

    const platforms = Object.keys(textureCompressConfig.configGroups);

    for (const key of Object.keys(configs)) {
        const item = configs[key];
        if (!item || typeof item !== 'object') {
            console.error(i18n.t('builder.project.texture_compress.tips.xx_require_object', {
                name: `${key}(${item})`,
            }));
            return false;
        }
        if (!item.name) {
            console.error(i18n.t('builder.project.texture_compress.tips.require_name'));
            return false;
        }

        if (!item.options || typeof item.options !== 'object' || Array.isArray(item)) {
            console.error(i18n.t('builder.project.texture_compress.tips.xx_require_object', {
                name: 'options',
            }));
            return false;
        }
        for (const configPlatform of Object.keys(item.options)) {
            if (!platforms.includes(configPlatform)) {
                console.error(i18n.t('builder.project.texture_compress.tips.platform_err', {
                    name: 'options',
                    supportPlatforms: platforms.toString(),
                }));
                return false;
            }

            const compressOptions = item.options[configPlatform];
            for (const textureCompressType of Object.keys(compressOptions)) {
                // const config = textureCompressConfig.formatsInfo[textureCompressType];
                // if (!config) {
                //     console.error(i18n.t('builder.project.texture_compress.tips.texture_type_err', {
                //         format: textureCompressType,
                //         supportFormats: Object.keys(textureCompressConfig.formatsInfo).toString(),
                //     }));
                //     return false;
                // }
                // // @ts-ignore
                // const qualityOptions = textureCompressConfig.textureFormatConfigs[config.formatType];
                // const value = compressOptions[textureCompressType];
                // if (config.formatType !== 'number') {
                //     if (!Object.keys(qualityOptions.options).includes(value)) {
                //         console.error(i18n.t('builder.project.texture_compress.tips.options_quality_type_err', {
                //             userformatType: value,
                //             formatType: config.formatType,
                //             formatTypeOptions: Object.keys(qualityOptions.options).toString(),
                //         }));
                //         return false;
                //     }
                // } else {
                //     if (typeof value !== 'number' || value < qualityOptions.min || value > qualityOptions.max) {
                //         console.error(i18n.t('builder.project.texture_compress.tips.options_quality_type_err', {
                //             userformatType: value,
                //             min: qualityOptions.min,
                //             max: qualityOptions.max,
                //         }));
                //         return false;
                //     }
                // }
            }
        }
    }
    return true;
}

export async function warnModuleFallBack(moduleToFallBack: Record<string, string>, platform: string) {
    if (!Object.keys(moduleToFallBack).length) {
        return;
    }
    const fallbackMsg = Object.keys(moduleToFallBack).reduce((prev, curr, index) => {
        if (index === 1) {
            return changeFallbackStr(prev) + `, ${changeFallbackStr(curr, moduleToFallBack[curr])}`;
        }
        return prev + `, ${changeFallbackStr(curr, moduleToFallBack[curr])}`;
    });
    return console.warn(i18n.t('builder.warn.engineModulesFallBackTip', {
        platform,
        fallbackMsg,
    }));
}

function changeFallbackStr(module: string, fallback?: string) {
    return fallback ? `${module} -> ${fallback}` : `${module}×`;
}

/**
 * 将路径名称的时间转为时间戳
 * @param time 
 * @returns 
 */
export function transTimeToNumber(time: string) {
    time = basename(time, '.log');
    const info = time.match(/-(\d+)$/);
    if (info) {
        const timeStr = Array.from(time);
        timeStr[info.index!] = ':';
        return new Date(timeStr.join('')).getTime();
    }
    return new Date().getTime();
}

/**
 * 获取一个可作为构建任务日志的路径(project://temp/builder/log/xxx2019-3-20 16-00.log)
 * @param taskName 
 * @param time 
 * @returns 
 */
export function getTaskLogDest(taskName: string, time: number | string) {
    return Utils.Path.resolveToUrl(join(BuildGlobalInfo.projectTempDir, 'builder', 'log', taskName + changeToLocalTime(time, 5).replace(/:/g, '-') + '.log'), 'project');
}

/**
 * 获取可阅读的最新时间信息（2023-4-24 17:31:54）
 */
export function getCurrentTime() {
    return changeToLocalTime(Date.now());
}

/**
 * 将时间戳转为可阅读的时间信息（2023-4-24 17:31:54）
 * @param t 
 */
export function changeToLocalTime(t: number | string, len = 8) {
    const time = new Date(Number(t));
    return time.toLocaleDateString().replace(/\//g, '-') + ' ' + time.toTimeString().slice(0, len);
}

/**
 * 检查传递的 errorMap 内是否包含错误字符串信息
 * @param errorMap 
 * @returns boolean true：存在错误
 */
export function checkHasError(errorMap?: Record<string, any>): boolean {
    if (!errorMap) {
        return false;
    }
    if (typeof errorMap === 'object' && !Array.isArray(errorMap)) {
        for (const key of Object.keys(errorMap)) {
            const res = checkHasError(errorMap[key]);
            if (res) {
                return true;
            }
        }
    } else if (typeof errorMap === 'string') {
        return true;
    }
    return false;
}

/**
 * 从命令中提取参数
 * @param command 
 * @returns 
 */
export function getParamsFromCommand(command: string) {
    if (!command) {
        return [];
    }
    const matchInfo = command.match(/\$\{([^${}]*)}/g);
    if (!matchInfo) {
        return [];
    }
    return matchInfo.map((str) => str.replace('${', '').replace('}', ''));
}

export function checkConfigDefault(config: IConfigItem): any {
    if (!config) {
        return null;
    }
    if (config.default !== undefined && config.default !== null) {
        return config.default;
    }
    if (config.type === 'array' && Array.isArray(config.itemConfigs)) {
        config.default = [];
        config.itemConfigs.forEach((item, index) => {
            config.default[index] = checkConfigDefault(item);
        });
    }
    if (config.type === 'object' && typeof config.itemConfigs === 'object') {
        config.default = {};
        Object.keys(config.itemConfigs).forEach((itemKey) => {
            // @ts-ignore
            config.default[itemKey] = checkConfigDefault(config.itemConfigs[itemKey]);
        });
    }
    return config.default;
}

export function defaultsDeep(data: any, defaultData: any) {
    if (data === undefined || data === null) {
        return data;
    }
    if (Array.isArray(data)) {
        return data;
    }
    Object.keys(defaultData).forEach((key) => {
        const value = defaultData[key];
        if (typeof value === 'object' && !Array.isArray(value) && value) {
            if (!data[key]) {
                data[key] = {};
            }
            defaultsDeep(data[key], value);
            return;
        }
        if (data[key] === undefined || data[key] === null) {
            data[key] = value;
        }
    });
    return data;
}

export function defaultMerge(target: Record<string, any>, ...sources: Record<string, any>[]) {
    // 遍历 sources 数组中的每一个源对象
    for (const source of sources) {
        // 如果源对象为空或不是一个对象，跳过
        if (!source || typeof source !== 'object') {
            continue;
        }
        // 遍历源对象的所有可枚举属性
        for (const key in source) {
            // 如果目标对象没有该属性，直接复制
            if (!(key in target)) {
                target[key] = source[key];
            } else {
                // 如果目标对象已经有该属性，且该属性的值是对象类型，递归合并
                if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    // 如果自定义合并函数存在，则调用自定义合并函数，否则递归调用 mergeWith() 方法合并
                    target[key] = defaultMerge(target[key], source[key]);
                } else {
                    // 否则直接使用源对象的属性覆盖目标对象的属性
                    target[key] = source[key];
                }
            }
        }
    }
    // 返回合并后的目标对象
    return target;
}

/**
 * 翻译 title
 * @param title 原始 title 或者带有 i18n 开头的 title
 */
export function transI18nName(name: string): string {
    if (typeof name !== 'string') {
        return '';
    }
    if (name.startsWith('i18n:')) {
        name = name.replace('i18n:', '');
        if (!i18n.t(name)) {
            console.debug(`${name} is not defined in i18n`);
        }
        return i18n.t(name) || name;
    }
    return name;
}

export function transI18n(key: string, obj?: {
    [key: string]: string;
}) {
    return i18n.t(key, obj);
}

export function getBuildPath(options: IBuildTaskOption) {
    return join(Utils.Path.resolveToRaw(options.buildPath), options.outputName || options.platform);
}

/**
 * 执行某个模块的方法或者获取某个模块的属性值
 * @param module 
 * @param key 
 * @param args 
 */
export async function requestModule(module: any, key: string, ...args: any[]) {
    try {
        if (typeof module === 'function') {
            return await module[key](...args);
        }
        return module[key];
    } catch (error) {
        console.debug(error);
        return null;
    }
}

/**
 * 将毫秒时间转换为时分秒
 * @param msTime 
 */
export function formatMSTime(msTime: number) {
    const time = msTime / 1000;
    let res = '';
    const hour = Math.floor(time / 60 / 60);
    if (hour) {
        res = `${hour} h`;
    }
    const minute = (Math.floor(time / 60) % 60);
    if (minute) {
        res += ` ${minute} min`;
    }
    const second = (Math.floor(time) % 60);
    if (second) {
        res += ` ${second} s`;
    }
    const ms = msTime - (hour * 60 * 60 + minute * 60 + second) * 1000;
    // 产品需求：不足秒时才显示毫秒
    if (ms && !res) {
        res += ` ${ms} ms`;
    }
    return res.trimStart();
}

export function resolveToRaw(urlOrPath: string, root: string) {
    if (isAbsolute(urlOrPath)) {
        return urlOrPath;
    } else {
        return join(root, urlOrPath);
    }
}