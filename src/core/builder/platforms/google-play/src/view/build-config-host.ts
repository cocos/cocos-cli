import * as fs from 'node:fs';
import * as path from 'node:path';

type Bundle = Record<string, unknown>;

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
}

const ICON_DPI_LIST: Record<string, number> = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
};

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

function workspaceRootCandidates(): string[] {
    return [
        process.cwd(),
        path.resolve(__dirname, '../../../../../../..'),
        path.resolve(__dirname, '../../../../../../../..'),
    ];
}

function defaultIconRoot(): string {
    for (const root of workspaceRootCandidates()) {
        const candidate = path.join(root, 'static', 'assets', 'google-play', 'icons');
        if (existsDir(candidate)) {
            return candidate;
        }
    }
    return path.join(process.cwd(), 'static', 'assets', 'google-play', 'icons');
}

function getIconInfo(type: 'default' | 'custom', outputName: string, projectPath?: string) {
    const base = type === 'custom' && projectPath
        ? path.join(projectPath, 'settings', 'icons', outputName)
        : defaultIconRoot();

    let display = '';
    const list = Object.entries(ICON_DPI_LIST).map(([dirName, dpi]) => {
        const fileName = 'ic_launcher.png';
        const iconPath = path.join(base, dirName, fileName);
        if (dirName === 'mipmap-xxxhdpi') {
            display = `${iconPath}?timestamp=${Date.now()}`;
        }
        return { dirName, fileName, dpi, path: iconPath };
    });

    return { type, display, list };
}

function hasIcon(info: ReturnType<typeof getIconInfo>): boolean {
    return fs.existsSync(info.list[0].path);
}

function getDisplayCustomIcon(type: 'default' | 'custom', outputName: string, projectPath?: string): string {
    const info = getIconInfo(type, outputName, projectPath);
    if (!hasIcon(info)) {
        return getIconInfo('default', outputName, projectPath).display;
    }
    return info.display;
}

async function saveCustomIcon(source: string, outputName: string, projectPath: string): Promise<string> {
    const sharp = require('sharp') as (input: string) => {
        resize(width: number, height: number, options?: Record<string, unknown>): {
            withMetadata(metadata: Record<string, unknown>): { toFile(file: string): Promise<unknown> };
        };
    };
    const info = getIconInfo('custom', outputName, projectPath);

    for (const item of info.list) {
        fs.mkdirSync(path.dirname(item.path), { recursive: true });
        await sharp(source)
            .resize(item.dpi, item.dpi, { fit: 'inside' })
            .withMetadata({ density: item.dpi })
            .toFile(item.path);
    }

    return info.display;
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('getAndroidAPILevels', () => getAndroidAPILevels());
    context.registerMethod('getDisplayCustomIcon', (type: 'default' | 'custom', outputName = 'default', projectPath?: string) => {
        return getDisplayCustomIcon(type, outputName, projectPath);
    });
    context.registerMethod('selectFile', async (filters?: Record<string, string[]>) => {
        const vscode = require('vscode') as typeof import('vscode');
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters,
        });
        return result?.[0]?.fsPath || '';
    });
    context.registerMethod('selectCustomIcon', async (outputName = 'default', projectPath?: string) => {
        const vscode = require('vscode') as typeof import('vscode');
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { Images: ['png'] },
            title: 'Select Google Play icon',
        });
        const source = result?.[0]?.fsPath;
        if (!source || !projectPath) {
            return '';
        }
        return saveCustomIcon(source, outputName, projectPath);
    });
    context.registerMethod('saveCustomIcon', async (source: string, outputName = 'default', projectPath?: string) => {
        if (!source || !projectPath) {
            return '';
        }
        return saveCustomIcon(source, outputName, projectPath);
    });
    context.registerMethod('openProgramSettings', async () => {
        try {
            const vscode = require('vscode') as typeof import('vscode');
            await vscode.commands.executeCommand('workbench.action.openSettings', 'android sdk');
            return true;
        } catch {
            return false;
        }
    });
}
