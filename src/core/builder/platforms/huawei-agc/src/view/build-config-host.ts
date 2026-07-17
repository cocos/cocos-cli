import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

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

function getAndroidAPILevels(): number[] {
    let sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    if (!sdkPath && process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const defaultSdkPath = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
        if (fs.existsSync(defaultSdkPath)) {
            sdkPath = defaultSdkPath;
        }
    }
    if (!sdkPath && process.platform === 'darwin' && process.env.HOME) {
        const defaultSdkPath = path.join(process.env.HOME, 'Library', 'Android', 'sdk');
        if (fs.existsSync(defaultSdkPath)) {
            sdkPath = defaultSdkPath;
        }
    }
    const platformPath = path.join(sdkPath, 'platforms');
    if (!sdkPath || !fs.existsSync(platformPath)) {
        return [];
    }
    return fs.readdirSync(platformPath)
        .map((name) => /^android-(\d+)$/.exec(name)?.[1])
        .filter((level): level is string => !!level && Number(level) >= 19)
        .map(Number)
        .sort((a, b) => b - a);
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string) => lookup(loadBundle(), key) || key);
    context.registerMethod('getAndroidAPILevels', () => getAndroidAPILevels());
    context.registerMethod('openProgramSettings', async () => {
        try {
            await vscode.commands.executeCommand('pinkSettings.start', { scope: 'global', nodeId: 'pinkProgramManagerSettings' });
            return true;
        } catch {
            return false;
        }
    });
}
