'use strict';

import type { i18n as I18Next } from 'i18next';
import type { I18nKeys } from '../../i18n/types/generated';

/**
 * 通用 I18n 封装：接受一个 i18next 实例，提供翻译/资源管理 API。
 *
 * 主进程通过 base/i18n.ts 注入 fs-loaded 的全局 i18next 单例；
 * scene-process (WebView) 通过 createInstance() 构造本地实例，从 RPC 注入数据。
 *
 * 拆分理由：本文件不引用任何 fs/Node-only 模块，可被 WebView 端 bundle 复用。
 */
export class I18n {
    _lang: string;
    private _instance: I18Next;

    constructor(instance: I18Next) {
        this._instance = instance;
        this._lang = instance.language || 'en';
    }

    /** Underlying i18next instance (for advanced init/configuration). */
    get instance(): I18Next {
        return this._instance;
    }

    /**
     * 设置当前语言。返回 Promise，调用方需要在切换完成后立即查询时应 await。
     */
    async setLanguage(language: string): Promise<void> {
        this._lang = language;
        await this._instance.changeLanguage(language);
    }

    /**
     * 翻译一个 key，允许传插值参数
     */
    t(key: I18nKeys, obj?: { [key: string]: string }) {
        return this._instance.t(key, obj);
    }

    /**
     * 翻译 name：未带 i18n: 前缀或查不到时原样返回
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
        if (!this._instance.exists(key)) {
            return name;
        }
        return this._instance.t(key) || name;
    }

    /**
     * 导出所有语言的原始翻译资源（i18next 内部 nested 结构），供远端进程重建本地实例。
     *
     * 返回 `{ lang: 当前语言, data: { en: <raw bundle>, zh: <raw bundle> } }`。
     * 接收方负责 flatten / 注入 i18next（见 scene-process/i18n.ts）。
     */
    getBundle(): { lang: string; data: Record<string, Record<string, any>> } {
        const result: Record<string, Record<string, any>> = {};
        for (const lang of ['en', 'zh']) {
            result[lang] = (this._instance.getResourceBundle(lang, 'translation') ?? {}) as Record<string, any>;
        }
        return { lang: this._lang, data: result };
    }

    /**
     * 动态注册语言包补丁内容
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

        this._instance.addResources(language, 'translation', entries);
    }
}
