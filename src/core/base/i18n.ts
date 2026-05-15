'use strict';

import i18nextInstance from '../../i18n';
import type { I18nKeys } from '../../i18n/types/generated';

class I18n {
    _lang: string;

    constructor() {
        this._lang = 'en';
    }

    /**
     * 设置当前语言
     * @param {string} language 语言代码
     */
    setLanguage(language: string) {
        this._lang = language;
        i18nextInstance.changeLanguage(language);
    }

    /**
     * 翻译一个 key
     * 允许翻译变量 {a}，传入的第二个参数 obj 内定义 a
     * 
     * @param key 翻译内容对应的 key
     * @param obj 翻译参数
     */
    t(key: I18nKeys, obj?: {
        [key: string]: string;
    }) {
        // 直接使用 i18next 进行翻译
        return i18nextInstance.t(key, obj);
    }
    /**
     * 翻译 name
     * @param name 原始 name 或者带有 i18n 开头的 name
     */
    transI18nName(name: string): string {
        if (!name || typeof name !== 'string') {
            return '';
        }
        const prefix = 'i18n:';
        if (!name.startsWith(prefix)) {
            return name;
        }
        const key = name.slice(prefix.length);
        if (!key) {
            return name;
        }
        if (!i18nextInstance.exists(key)) {
            // 引擎大部分都没翻译，这样会导致每次调用获取节点信息会答应大量的debug信息，这里暂时去掉。
            // console.debug(`${name} is not defined in i18n`);
            return name;
        }
        return i18nextInstance.t(key) || name;
    }

    batchTransI18nName(names: string[]): Record<string, string> {
        const result: Record<string, string> = {};
        for (const name of names) {
            result[name] = this.transI18nName(name);
        }
        return result;
    }

    /**
     * 动态注册语言包的补丁内容
     * @param language 语言代码，例如 zh、en
     * @param patchPath 需要覆盖的 i18n 路径（会作为 key 前缀，使用 “.” 分隔）
     * @param languageData 需要注入的语言数据对象
     */
    registerLanguagePatch(language: string, patchPath: string, languageData: Record<string, any>) {
        if (!language || typeof language !== 'string') {
            console.warn('[i18n] registerLanguagePatch: invalid language', language);
            return;
        }
        if (typeof patchPath !== 'string') {
            console.warn('[i18n] registerLanguagePatch: invalid patch path', patchPath);
            return;
        }
        if (!languageData || typeof languageData !== 'object') {
            console.warn('[i18n] registerLanguagePatch: invalid language data', languageData);
            return;
        }

        const normalizedPrefix = patchPath.replace(/^\.+/, '').trim();
        const entries: Record<string, any> = {};

        function flatten(obj: Record<string, any>, prefix: string) {
            Object.keys(obj).forEach((key) => {
                const value = obj[key];
                const currentKey = prefix ? `${prefix}.${key}` : key;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    flatten(value, currentKey);
                } else {
                    entries[currentKey] = value;
                }
            });
        }

        flatten(languageData, normalizedPrefix);

        if (Object.keys(entries).length === 0) {
            return;
        }

        i18nextInstance.addResources(language, 'translation', entries);
    }
}

export default new I18n();
