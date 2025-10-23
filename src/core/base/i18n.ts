'use strict';

import i18nextInstance from '../../i18n';

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
    t(key: string, obj?: {
        [key: string]: string;
    }) {
        // 直接使用 i18next 进行翻译
        return i18nextInstance.t(key, obj);
    }
}

export default new I18n();