import * as fs from 'node:fs';
import * as pink from 'pink';
import * as path from 'node:path';

type Bundle = Record<string, unknown>;

type PreBuildHookFn = (
    options: Record<string, unknown>,
) => Promise<Record<string, unknown> | void>;

interface NativeEngineInfo {
    type?: string;
    path?: string;
}

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
    registerPreBuildHook?(fn: PreBuildHookFn): void;
}

const PLATFORM = 'android';
const ANDROID_SDK_CONFIG_KEY = 'programManager.androidSDK';
const ANDROID_NDK_CONFIG_KEY = 'programManager.androidNDK';
const JAVA_HOME_CONFIG_KEY = 'programManager.javaHome';

interface AndroidPackage {
    sdkPath?: string;
    ndkPath?: string;
    javaHome?: string;
    javaPath?: string;
}

interface AndroidBuildOptions {
    packages?: {
        [PLATFORM]?: AndroidPackage;
    };
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

async function findSdkPath(): Promise<string> {
    return getConfigurationString(ANDROID_SDK_CONFIG_KEY);
}

async function getConfigurationString(key: string): Promise<string> {
    const value = await pink.configuration.get(key);
    return typeof value === 'string' ? value : '';
}

function resolveJavaPaths(javaHome: string): { javaHome: string; javaPath: string } {
    if (!javaHome) {
        return { javaHome: '', javaPath: '' };
    }

    try {
        const st = fs.statSync(javaHome);
        if (st.isFile()) {
            return {
                javaHome: path.normalize(path.join(path.dirname(javaHome), '..')),
                javaPath: javaHome,
            };
        }

        if (st.isDirectory()) {
            const javaFileName = process.platform === 'win32' ? 'java.exe' : 'java';
            const javaPath = path.join(javaHome, 'bin', javaFileName);
            if (fs.existsSync(javaPath)) {
                return { javaHome, javaPath };
            }
            console.error(`Java executable not found at ${javaHome}/bin`);
        }
    } catch (error) {
        console.error(error);
    }

    return { javaHome, javaPath: '' };
}

async function createProgramPathPatch(pkg?: AndroidPackage): Promise<AndroidPackage> {
    const patch: AndroidPackage = {};

    if (!pkg?.sdkPath) {
        const sdkPath = await getConfigurationString(ANDROID_SDK_CONFIG_KEY);
        if (sdkPath) {
            patch.sdkPath = sdkPath;
        }
    }

    if (!pkg?.ndkPath) {
        const ndkPath = await getConfigurationString(ANDROID_NDK_CONFIG_KEY);
        if (ndkPath) {
            patch.ndkPath = ndkPath;
        }
    }

    const javaHomeSource = pkg?.javaHome || (await getConfigurationString(JAVA_HOME_CONFIG_KEY));
    if (!pkg?.javaHome && javaHomeSource) {
        patch.javaHome = javaHomeSource;
    }

    if (!pkg?.javaPath && javaHomeSource) {
        const javaPaths = resolveJavaPaths(javaHomeSource);
        if (!pkg?.javaHome && javaPaths.javaHome) {
            patch.javaHome = javaPaths.javaHome;
        } else if (pkg?.javaHome && javaPaths.javaHome !== pkg.javaHome) {
            patch.javaHome = javaPaths.javaHome;
        }
        if (javaPaths.javaPath) {
            patch.javaPath = javaPaths.javaPath;
        }
    }

    return patch;
}

function getAPILevel(apiLevelStr: string): number {
    const match = (apiLevelStr || '').match(/^android-([0-9]+)$/);
    return match ? Number.parseInt(match[1], 10) : -1;
}

async function getAndroidAPILevels(): Promise<number[]> {
    const sdkPath = await findSdkPath();
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

    context.registerPreBuildHook?.(async (options) => {
        const buildOptions = options as AndroidBuildOptions;
        const pkg = buildOptions.packages?.[PLATFORM];
        const patch = await createProgramPathPatch(pkg);

        if (Object.keys(patch).length) {
            return {
                packages: {
                    [PLATFORM]: patch,
                },
            };
        }
        return;
    });
}
