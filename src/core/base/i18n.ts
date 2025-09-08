'use strict';

import { EventEmitter } from 'events';
import * as lodash from 'lodash';

class I18n extends EventEmitter {
    _lang: string;

    _data: Record<string, Record<string, any>> = {};
    constructor() {
        super();
        this._lang = 'en';
    }
    /**
         * 注册本地化的数据
         * @param {object} data 本地化 i18n 数据
         * @param {string} language 语言 id
         */
    register(language: string, data: Record<string, any>) {
        language = language || this._lang;
        this._data[language] = data;
        this.emit(`register`, data, language);
    }

    /**
     * 注销本地化数据
     * @param {object} data 本地化 i18n 数据
     * @param {string} language 语言 id
     */
    unregister(language?: string) {
        language = language || this._lang;
        delete this._data[language];
        this.emit('unregister', language);
    }

    /**
     * 附加数据到已经注册的数据里
     * @param {string} paths
     * @param {object} data
     * @param {language} language
     */
    append(paths: string, language: string, data: object | string) {
        this._data[language] = this._data[language] || {};
        lodash.set(this._data[language], paths, data);
        this.emit(`append`, paths, data, language);
    }

    /**
     * 翻译一个 key
     * 允许翻译变量 {a}，传入的第二个参数 obj 内定义 a
     * 
     * @param str 翻译内容对应的 key
     * @param obj 翻译参数
     */
    t(key: string, obj?: {
        [key: string]: string | number;
    }) {
        let text = lodash.get(this._data[this._lang], key);
        if (typeof text !== 'string') {
            return key;
        }
        if (obj && typeof obj === 'object') {
            const len = Object.keys(obj).length;
            if (len) {
                const reg = /\{([a-zA-Z_]+[a-zA-Z0-9_])\}/g;
                text = text.replace(reg, function (params: string, key: string) {
                    return '' + obj[key];
                });
            }
        }
    }
}

export default new I18n();