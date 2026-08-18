import * as path from 'node:path';
import * as pink from 'pink';
import * as vscode from 'vscode';

type Bundle = Record<string, unknown>;
type UploadEnv = 'dev' | 'fat' | 'prod';

type PreBuildHookFn = (
    options: Record<string, unknown>,
) => Promise<Record<string, unknown> | void>;

interface HostContext {
    registerMethod(name: string, handler: (...args: any[]) => unknown | Promise<unknown>): void;
    registerPreBuildHook?(fn: PreBuildHookFn): void;
}

interface OpenPaasResponse<T = unknown> {
    ret_code: number;
    ret_msg: string;
    data: T;
}

interface PageInfo<T> {
    records: T[];
}

interface QueryGameInfoResponse {
    game_id: string;
    game_name: string;
    game_icon?: string;
    code_version?: string | number | null;
}

interface GamePackageContextResponse {
    public_key?: string;
    context?: Record<string, unknown>;
    context_ordered_json?: string;
    context_signature?: string;
    context_signature_version?: number;
}

interface WebPackageBridgeResponse {
    link: string;
}

interface WebPackageBridgeResult {
    bridgeLink: string;
    accessToken: string;
    uploadEnv: UploadEnv;
}

interface OpenPaasEndpoint {
    apiBaseUrl: string;
    uploadEnv: UploadEnv;
}

const PLATFORM = 'web-desktop';
const BRIDGE_API_PATH = '/api/game/web/package/bridge';

function currentLang(): 'zh' | 'en' {
    let locale = 'en';
    try {
        const config = process.env.VSCODE_NLS_CONFIG;
        if (config) {
            locale = (JSON.parse(config) as { locale?: string }).locale || locale;
        }
    } catch {
        // Fall back to English when the host locale cannot be parsed.
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
    let current: unknown = bundle;
    for (const segment of key.split('.')) {
        if (current && typeof current === 'object' && segment in (current as Bundle)) {
            current = (current as Bundle)[segment];
        } else {
            return undefined;
        }
    }
    return typeof current === 'string' ? current : undefined;
}

function substitute(text: string, sub?: Record<string, unknown>): string {
    if (!sub) {
        return text;
    }
    return text.replace(/%?\{(\w+)\}/g, (match, key: string) => (key in sub ? String(sub[key]) : match));
}

function normalizeEnv(env: unknown): UploadEnv | undefined {
    return env === 'dev' || env === 'fat' || env === 'prod' ? env : undefined;
}

async function resolveOpenPaasEndpoint(): Promise<OpenPaasEndpoint> {
    try {
        const config = await pink.baseConfig.getConfig();
        const apiBaseUrl = String(config?.api?.api || '').trim().replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('baseConfig.api.api is empty');
        }
        return {
            apiBaseUrl,
            uploadEnv: normalizeEnv(config?.env) || 'prod',
        };
    } catch (error) {
        throw new Error(`Failed to resolve OpenPaaS API base URL from pink.baseConfig.getConfig(): ${errorMessage(error)}`);
    }
}

async function readAccessToken(): Promise<string> {
    const envToken = String(process.env.OPENPAAS_ACCESS_TOKEN || process.env.SUD_ACCESS_TOKEN || '').trim();
    if (envToken) {
        return envToken;
    }

    const session = await vscode.authentication.getSession('pink', [], { createIfNone: true });
    if (!session?.accessToken) {
        throw new Error('No Pink authentication session found');
    }
    return session.accessToken;
}

function normalizeCodeVersion(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const normalized = String(value).trim();
    return normalized || undefined;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message || error.stack || String(error);
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message?: unknown }).message);
    }
    return String(error);
}

async function readResponseBody(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

async function postOpenPaas<T>(apiPath: string, body: Record<string, unknown>): Promise<{ data: T; accessToken: string; uploadEnv: UploadEnv }> {
    const { apiBaseUrl, uploadEnv } = await resolveOpenPaasEndpoint();
    const accessToken = await readAccessToken();
    const url = `${apiBaseUrl}${apiPath}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sud-at': accessToken,
                'x-sud-encrypt-request': 'true',
            },
            body: JSON.stringify(body),
        });
    } catch (error) {
        throw new Error(`OpenPaaS request failed: ${apiPath}, env=${uploadEnv}, reason=${errorMessage(error)}`);
    }

    if (!response.ok) {
        const responseBody = await readResponseBody(response);
        throw new Error(`OpenPaaS request failed: ${apiPath}, env=${uploadEnv}, HTTP ${response.status}${responseBody ? `, body=${responseBody.slice(0, 1000)}` : ''}`);
    }

    const responseBody = await readResponseBody(response);
    let result: OpenPaasResponse<T>;
    try {
        result = JSON.parse(responseBody) as OpenPaasResponse<T>;
    } catch (error) {
        throw new Error(`OpenPaaS response is not valid JSON: ${apiPath}, env=${uploadEnv}, reason=${errorMessage(error)}${responseBody ? `, body=${responseBody.slice(0, 1000)}` : ''}`);
    }
    if (result.ret_code !== 0) {
        throw new Error(`OpenPaaS API error: ${apiPath}, env=${uploadEnv}, code=${result.ret_code}, message=${result.ret_msg}`);
    }

    return { data: result.data, accessToken, uploadEnv };
}

async function getOpenPaasWebPackageBridge(accessToken: string, endpoint: OpenPaasEndpoint): Promise<string> {
    const { apiBaseUrl, uploadEnv } = endpoint;
    const url = `${apiBaseUrl}${BRIDGE_API_PATH}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-sud-at': accessToken,
                'x-sud-encrypt-request': 'true',
            },
        });
    } catch (error) {
        throw new Error(`OpenPaaS request failed: ${BRIDGE_API_PATH}, env=${uploadEnv}, reason=${errorMessage(error)}`);
    }

    if (!response.ok) {
        const responseBody = await readResponseBody(response);
        throw new Error(`OpenPaaS request failed: ${BRIDGE_API_PATH}, env=${uploadEnv}, HTTP ${response.status}${responseBody ? `, body=${responseBody.slice(0, 1000)}` : ''}`);
    }

    const responseBody = await readResponseBody(response);
    let result: OpenPaasResponse<WebPackageBridgeResponse>;
    try {
        result = JSON.parse(responseBody) as OpenPaasResponse<WebPackageBridgeResponse>;
    } catch (error) {
        throw new Error(`OpenPaaS response is not valid JSON: ${BRIDGE_API_PATH}, env=${uploadEnv}, reason=${errorMessage(error)}${responseBody ? `, body=${responseBody.slice(0, 1000)}` : ''}`);
    }
    if (result.ret_code !== 0) {
        throw new Error(`OpenPaaS API error: ${BRIDGE_API_PATH}, env=${uploadEnv}, code=${result.ret_code}, message=${result.ret_msg}`);
    }

    const link = String(result.data?.link || '').trim();
    if (!link) {
        throw new Error(`OpenPaaS API error: ${BRIDGE_API_PATH}, env=${uploadEnv}, bridge link is empty`);
    }
    return link;
}

async function resolveOpenPaasWebPackageBridge(): Promise<WebPackageBridgeResult> {
    const accessToken = await readAccessToken();
    const endpoint = await resolveOpenPaasEndpoint();
    const bridgeLink = await getOpenPaasWebPackageBridge(accessToken, endpoint);
    return {
        bridgeLink,
        accessToken,
        uploadEnv: endpoint.uploadEnv,
    };
}

async function getOpenPaasGameList() {
    const { data, accessToken, uploadEnv } = await postOpenPaas<PageInfo<QueryGameInfoResponse>>('/api/game/list', {
        page_no: 1,
        page_size: 100,
    });

    const games = (data.records || []).map((game) => {
        const codeVersion = normalizeCodeVersion(game.code_version);
        return {
            id: String(game.game_id || '').trim(),
            name: String(game.game_name || '').trim(),
            icon: typeof game.game_icon === 'string' ? game.game_icon : '',
            codeVersion,
            label: `${game.game_id}${game.game_name ? ` (${game.game_name})` : ''}`,
        };
    }).filter((game) => game.id);

    return {
        games,
        accessToken,
        uploadEnv,
    };
}

async function getOpenPaasPackageContext(gameId: unknown) {
    const normalizedGameId = String(gameId || '').trim();
    if (!normalizedGameId) {
        throw new Error('Missing OpenPaaS game id');
    }

    const { data, accessToken, uploadEnv } = await postOpenPaas<GamePackageContextResponse>('/api/game/package/context', {
        game_id: normalizedGameId,
    });
    const codeVersion = normalizeCodeVersion((data.context as any)?.game_info?.code_version);

    return {
        ...data,
        accessToken,
        uploadEnv,
        codeVersion,
    };
}

export function activate(context: HostContext): void {
    context.registerPreBuildHook?.(async () => {
        const { accessToken, uploadEnv, bridgeLink } = await resolveOpenPaasWebPackageBridge();
        return {
            packages: {
                [PLATFORM]: {
                    accessToken,
                    uploadEnv,
                    bridgeLink,
                },
            },
        };
    });
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('getOpenPaasGameList', () => getOpenPaasGameList());
    context.registerMethod('getOpenPaasPackageContext', (gameId: unknown) => getOpenPaasPackageContext(gameId));
    context.registerMethod('getOpenPaasWebPackageBridge', () => resolveOpenPaasWebPackageBridge());
}
