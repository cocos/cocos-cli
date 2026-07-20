import * as path from 'node:path';

type Bundle = Record<string, unknown>;

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
}

function currentLang(): 'zh' | 'en' {
    let locale = 'en';
    try {
        const cfg = process.env.VSCODE_NLS_CONFIG;
        if (cfg) {
            locale = (JSON.parse(cfg) as { locale?: string }).locale || locale;
        }
    } catch {
        // Fallback to English.
    }
    return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let cache: { lang: string; bundle: Bundle } | undefined;

function loadBundle(): Bundle {
    const lang = currentLang();
    if (cache?.lang === lang) {
        return cache.bundle;
    }

    let bundle: Bundle = {};
    try {
        const file = path.join(__dirname, '..', '..', 'i18n', `${lang}.js`);
        delete require.cache[require.resolve(file)];
        bundle = (require(file) as Bundle) ?? {};
    } catch {
        bundle = {};
    }
    cache = { lang, bundle };
    return bundle;
}

function lookup(bundle: Bundle, key: string): string | undefined {
    let cur: unknown = bundle;
    for (const seg of key.split('.')) {
        if (cur && typeof cur === 'object' && seg in (cur as Bundle)) {
            cur = (cur as Bundle)[seg];
        } else {
            return undefined;
        }
    }
    return typeof cur === 'string' ? cur : undefined;
}

function substitute(text: string, sub?: Record<string, unknown>): string {
    if (!sub) {
        return text;
    }
    return text.replace(/%?\{(\w+)\}/g, (match, key: string) => (key in sub ? String(sub[key]) : match));
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
}
