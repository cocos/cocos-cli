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
}

export default new I18n();