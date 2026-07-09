import * as fs from 'node:fs';
import * as path from 'node:path';

type Bundle = Record<string, unknown>;

interface NativeEngineInfo {
    type?: string;
    path?: string;
}

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

function existsDir(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch {
        return false;
    }
}

function findSdkPath(): string {
    const envSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (envSdk && existsDir(envSdk)) {
        return envSdk;
    }

    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const defaultSdkPath = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
        if (existsDir(defaultSdkPath)) {
            return defaultSdkPath;
        }
    }
    if (process.platform === 'darwin' && process.env.HOME) {
        const defaultSdkPath = path.join(process.env.HOME, 'Library', 'Android', 'sdk');
        if (existsDir(defaultSdkPath)) {
            return defaultSdkPath;
        }
    }
    return '';
}

function getAPILevel(apiLevelStr: string): number {
    const match = (apiLevelStr || '').match(/^android-([0-9]+)$/);
    return match ? Number.parseInt(match[1], 10) : -1;
}

function getAndroidAPILevels(): number[] {
    const sdkPath = findSdkPath();
    if (!sdkPath) {
        return [];
    }

    const platformPath = path.join(sdkPath, 'platforms');
    if (!existsDir(platformPath)) {
        return [];
    }

    return fs.readdirSync(platformPath)
        .filter((name) => {
            const apiLevel = getAPILevel(name);
            return apiLevel >= 19 && existsDir(path.join(platformPath, name));
        })
        .map((name) => Number.parseInt(name.split('-')[1], 10))
        .sort((a, b) => b - a);
}

function getNativeEngineInfo(): NativeEngineInfo {
    try {
        const runtimeRequire = Function('return require')() as NodeRequire;
        const { Engine } = runtimeRequire(path.join(__dirname, '../../../../../engine'));
        return Engine.getInfo().native || {};
    } catch {
        return { type: 'builtin', path: '' };
    }
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('getAndroidAPILevels', () => getAndroidAPILevels());
    context.registerMethod('getNativeEngineInfo', () => getNativeEngineInfo());
    context.registerMethod('openEngineSettings', async () => {
        try {
            const vscode = require('vscode') as typeof import('vscode');
            await vscode.commands.executeCommand('pinkSettings.start', { scope: 'global', nodeId: 'cocos.engine' });
            return true;
        } catch {
            return false;
        }
    });
    context.registerMethod('openProgramSettings', async () => {
        try {
            const vscode = require('vscode') as typeof import('vscode');
            await vscode.commands.executeCommand('pinkSettings.start', { scope: 'global', nodeId: 'pinkProgramManagerSettings' });
            return true;
        } catch {
            return false;
        }
    });
}
