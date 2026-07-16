import * as pink from 'pink';
import * as vscode from 'vscode';
import * as path from 'node:path';

type Bundle = Record<string, unknown>;

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
}

interface PreviewRequest {
    buildPath?: string;
    outputName?: string;
    useWebGPU?: boolean;
}

interface PreviewInfo {
    previewUrl: string;
    qrcodeSrc: string;
    webGPUTips: string;
    webGPULink: string;
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

function runtimeRequire<T = any>(request: string): T | undefined {
    try {
        return module.require(request) as T;
    } catch {
        return undefined;
    }
}

async function createQRCodeSrc(url: string): Promise<string> {
    if (!url) {
        return '';
    }
    try {
        const qrcode = runtimeRequire<{ toDataURL?: (text: string, options?: Record<string, unknown>) => Promise<string> }>('qrcode');
        if (qrcode?.toDataURL) {
            return await qrcode.toDataURL(url, {
                errorCorrectionLevel: 'H',
                maskPattern: 2,
                margin: 1,
                width: 180,
            });
        }
    } catch {
        // Fallback to a remote image URL below.
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=1&data=${encodeURIComponent(url)}`;
}

async function getPreviewInfo(request: PreviewRequest = {}): Promise<PreviewInfo> {
    const buildPath = request.buildPath || 'project://build';
    const outputName = request.outputName || 'web-mobile';
    const platform = 'web-mobile';
    const previewUrl = await pink.builder.getPreviewUrl(path.join(buildPath, outputName), platform) || '';
    const webGPUTips = request.useWebGPU && previewUrl && !previewUrl.startsWith('https')
        ? lookup(loadBundle(), 'tips.webGPUServer') || ''
        : '';

    return {
        previewUrl,
        qrcodeSrc: webGPUTips ? '' : await createQRCodeSrc(previewUrl),
        webGPUTips,
        webGPULink: 'https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts',
    };
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('getPreviewInfo', (request: PreviewRequest) => getPreviewInfo(request));
    context.registerMethod('openPreviewUrl', async (url: string) => {
        if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    });
}
