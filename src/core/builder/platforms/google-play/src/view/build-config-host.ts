import * as fs from 'node:fs';
import * as pink from 'pink';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getDisplayCustomIcon as resolveDisplayCustomIcon,
    saveCustomIcon as saveProjectCustomIcon,
} from '../custom-icon';

type Bundle = Record<string, unknown>;

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
    getProjectPath?(): string | undefined;
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

function fileImageSrc(filePath: string): string {
    if (!filePath) {
        return '';
    }
    if (filePath.startsWith('data:image/')) {
        return filePath;
    }

    const [rawPath] = filePath.split('?');
    const sourcePath = rawPath.startsWith('file:') ? fileURLToPath(rawPath) : rawPath;
    const ext = path.extname(sourcePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
                ? 'image/svg+xml'
                : 'image/png';
    const data = fs.readFileSync(sourcePath).toString('base64');
    return `data:${mime};base64,${data}`;
}

async function getActiveProject(): Promise<string> {
    try {
        const project = await pink.workspace.getActiveProject();
        console.log('getActiveProject', JSON.stringify(project));
        return project?.path || '';
    } catch {
        console.error('getActiveProject error');
        return '';
    }
}

async function saveCustomIcon(source: string, outputName: string, projectPath: string): Promise<string> {
    console.log('saveCustomIcon22', source, outputName, projectPath);
    const sourcePath = source.startsWith('file:') ? fileURLToPath(source) : source;
    return saveProjectCustomIcon(sourcePath, projectPath, 'custom', outputName);
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('getAndroidAPILevels', () => getAndroidAPILevels());
    context.registerMethod('getDisplayCustomIcon', async (type: 'default' | 'custom', outputName = 'default', projectPath?: string) => {
        const _projectPath = projectPath || await getActiveProject();
        console.log('getDisplayCustomIcon11', type, outputName, _projectPath);
        return resolveDisplayCustomIcon(_projectPath, type, outputName);
    });
    context.registerMethod('fileImageSrc', (filePath: string) => {
        return fileImageSrc(filePath);
    });
    context.registerMethod('selectFile', async (filters?: Record<string, string[]>) => {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters,
        });
        return result?.[0]?.fsPath || '';
    });
    context.registerMethod('saveCustomIcon', async (source: string, outputName = 'default', projectPath?: string) => {
        if (!source) {
            return '';
        }
        const _projectPath = projectPath || await getActiveProject();
        console.log('saveCustomIcon11', source, outputName, _projectPath);
        return saveCustomIcon(source, outputName, _projectPath);
    });
    context.registerMethod('openProgramSettings', async () => {
        try {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'android sdk');
            return true;
        } catch {
            return false;
        }
    });
}
