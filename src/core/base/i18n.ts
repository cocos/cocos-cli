'use strict';

import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
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
     * 翻译 title
     * @param title 原始 title 或者带有 i18n 开头的 title
     */
    transI18nName(name: string): string {
        if (typeof name !== 'string') {
            return '';
        }
        if (name.startsWith('i18n:')) {
            name = name.replace('i18n:', '') as I18nKeys;
            if (!i18nextInstance.t(name)) {
                console.debug(`${name} is not defined in i18n`);
            }
            return i18nextInstance.t(name) || name;
        }
        return name;
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

    /**
     * 加载引擎包的 i18n 文件（.js CommonJS 模块）
     * 将 packages/engine/editor/i18n/{lang}/*.js 注册到 ENGINE.* 命名空间
     */
    loadEngineI18n(enginePath: string) {
        const i18nDir = join(enginePath, 'editor', 'i18n');
        if (!existsSync(i18nDir)) {
            return;
        }

        for (const lang of ['zh', 'en']) {
            const langDir = join(i18nDir, lang);
            if (!existsSync(langDir)) {
                continue;
            }

            readdirSync(langDir).forEach((file) => {
                if (!file.endsWith('.js')) {
                    return;
                }
                try {
                    const resolved = require.resolve(join(langDir, file));
                    delete require.cache[resolved];
                    const data = require(resolved);
                    this.registerLanguagePatch(lang, `ENGINE`, data);
                } catch (error) {
                    console.warn(`[i18n] Failed to load engine i18n: ${join(langDir, file)}`, error);
                }
            });
        }
    }
}

export default new I18n();