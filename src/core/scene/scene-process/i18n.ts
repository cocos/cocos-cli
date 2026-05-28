'use strict';
import i18next from 'i18next';
import { I18n } from '../../base/i18n-class';
import { Rpc } from './rpc';

const i18n = new I18n(i18next.createInstance());
let _ready = false;
let _initPromise: Promise<void> | null = null;

function flattenBundle(obj: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    const walk = (cur: Record<string, any>, prefix: string) => {
        for (const key of Object.keys(cur)) {
            const value = cur[key];
            const currentKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                walk(value, currentKey);
            } else {
                out[currentKey] = value;
            }
        }
    };
    walk(obj, '');
    return out;
}

export function initLocalI18n(): Promise<void> {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        try {
            const { lang, data } = await Rpc.getInstance().request('i18n', 'getBundle', []) as {
                lang: string;
                data: Record<string, Record<string, any>>;
            };
            if (!_ready) {
                await i18n.instance.init({
                    lng: lang,
                    fallbackLng: 'en',
                    resources: { [lang]: { translation: {} } },
                });
                _ready = true;
            }
            for (const [l, bundle] of Object.entries(data)) {
                i18n.instance.addResources(l, 'translation', flattenBundle(bundle));
            }
            await i18n.setLanguage(lang);
        } catch (e) {
            console.warn('[i18n] Failed to init local i18n bundle:', e);
        }
    })().finally(() => {
        _initPromise = null;
    });
    return _initPromise;
}

/**
 * Reload the local bundle from main process. Callers must invoke this after
 * main-process i18n state changes (setLanguage, dynamic patch registration).
 *
 * NOTE: main process cannot push invalidation in web mode (notify() requires
 * IPC), so reload must be triggered from the scene side after a known mutation.
 */
export async function reloadLocalI18n(): Promise<void> {
    if (_initPromise) await _initPromise;
    _initPromise = null;
    await initLocalI18n();
}

export default i18n;
