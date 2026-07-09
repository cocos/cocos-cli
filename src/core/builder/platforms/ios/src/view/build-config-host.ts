import { execSync } from 'node:child_process';
import * as path from 'node:path';

type Bundle = Record<string, unknown>;

interface TeamInfo {
    idx: string;
    hash: string;
    kind: string;
    displayValue: string;
    outputValue: string;
    fullValue: string;
    errorState?: string;
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

function flatArray(input: unknown, output: TeamInfo[]): void {
    if (Array.isArray(input)) {
        for (const item of input) {
            flatArray(item, output);
        }
        return;
    }
    if (input) {
        output.push(input as TeamInfo);
    }
}

function readOrganizationUnits(name: string): string[] {
    const pem = execSync(`xcrun security find-certificate -c "${name}" -p`, { encoding: 'utf8' });
    const text = execSync('openssl x509 -inform PEM -noout -text', { input: pem, encoding: 'utf8' });
    const reg = /OU\s*=\s*(\w+),/;
    return text
        .split('\n')
        .filter((line) => line.match(/^\s*Subject:/))
        .map((line) => line.match(reg))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => match[1]);
}

function findSignIdentify(): TeamInfo[] {
    try {
        const output = execSync('xcrun security find-identity -v -p codesigning', { encoding: 'utf8' });
        const reg = /(\w+\)) ([0-9A-Z]+) "([^"]+)"\s*(\((\w+)\))?/;
        const options = output
            .split('\n')
            .map((line) => line.match(reg))
            .filter((match): match is RegExpMatchArray => match !== null)
            .map((match) => {
                const parts = match[3].split(':');
                const teams = readOrganizationUnits(match[3]);
                return teams.map((teamId) => ({
                    idx: match[1].slice(0, -1),
                    hash: match[2],
                    kind: parts[0],
                    displayValue: (parts[1] || match[3]).trim(),
                    outputValue: teamId,
                    fullValue: match[3].replace(/\(\w+\)/, `(TEAM:${teamId})`),
                    errorState: match[5],
                }));
            });
        const list: TeamInfo[] = [];
        flatArray(options, list);
        return list.filter((item) => item.outputValue.length > 0);
    } catch (error) {
        const text = lookup(loadBundle(), 'tips.developerTeamListError') || 'Developer team information not found.';
        console.warn(`ios: ${text}`);
        console.warn(error);
        return [];
    }
}

export function activate(context: HostContext): void {
    context.registerMethod('getI18nBundle', () => loadBundle());
    context.registerMethod('t', (key: string, sub?: Record<string, unknown>) => {
        const text = lookup(loadBundle(), key);
        return text === undefined ? key : substitute(text, sub);
    });
    context.registerMethod('queryTeamInfo', () => findSignIdentify());
    context.registerMethod('query-team-info', () => findSignIdentify());
}
