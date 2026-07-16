import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
import { Checkbox, TypedField } from '@pink/ui-kit';

export interface PlatformBuildViewProps {
    value: Record<string, unknown>;
    onChange: (path: string[], value: unknown) => void;
    bridge?: {
        invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
    };
    commonValue?: Record<string, unknown>;
}

const DEFAULTS: Record<string, unknown> = {
    appABIs: ['arm64-v8a'],
    encrypted: false,
    xxteaKey: createEncryptionKey(),
    compressZip: false,
    JobSystem: 'none',
};

type AppABI = 'arm64-v8a';

const APP_ABIS: AppABI[] = ['arm64-v8a'];

const ROW: CSSProperties = { padding: '2px 16px 6px 0px' };
const INPUT: CSSProperties = {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    height: 26,
    padding: '0 8px',
    border: '1px solid var(--vscode-input-border, transparent)',
    color: 'var(--vscode-input-foreground)',
    background: 'var(--vscode-input-background)',
    outline: 'none',
};
const SELECT: CSSProperties = { ...INPUT, padding: '0 6px' };
const ERROR: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-errorForeground, #f14c4c)',
};
const INFO: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-descriptionForeground)',
};
const DISABLED_BLOCK: CSSProperties = {
    opacity: 0.55,
    pointerEvents: 'none',
};

function createEncryptionKey(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function translate(bundle: Record<string, unknown>, key: string): string {
    let cur: unknown = bundle;
    for (const seg of key.split('.')) {
        if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[seg];
        } else {
            return key;
        }
    }
    return typeof cur === 'string' ? cur : key;
}

function formatMessage(text: string, sub?: Record<string, unknown>): string {
    if (!sub) {
        return text;
    }
    return text.replace(/\{(\w+)\}/g, (match, key) => (key in sub ? String(sub[key]) : match));
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function boolValue(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function appABIsValue(value: unknown): AppABI[] {
    return Array.isArray(value) ? value.filter((item): item is AppABI => APP_ABIS.includes(item as AppABI)) : [];
}

function normalizeAppABIs(value: unknown): AppABI[] {
    const appABIs = appABIsValue(value);
    return appABIs.length ? appABIs : ['arm64-v8a'];
}

export default function HarmonyOSNextBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const t = (key: string, sub?: Record<string, unknown>) => formatMessage(translate(bundle, key), sub);
    const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
    const appABIs = normalizeAppABIs(current.appABIs);
    const encrypted = boolValue(current.encrypted);
    const compressZip = boolValue(current.compressZip);
    const isDebugMode = boolValue(commonValue?.debug);
    const jobSystem = stringValue(current.JobSystem) || 'none';
    const xxteaKey = stringValue(current.xxteaKey);

    const set = (key: string, next: unknown) => onChange([key], next);

    useEffect(() => {
        if (!bridge) {
            return;
        }

        let cancelled = false;
        bridge.invoke<Record<string, unknown>>('getI18nBundle')
            .then((data) => {
                if (!cancelled) {
                    setBundle(data ?? {});
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [bridge]);

    useEffect(() => {
        for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
            if (!(key in value)) {
                onChange([key], defaultValue);
            }
        }
        if (!appABIsValue(value.appABIs).length) {
            onChange(['appABIs'], ['arm64-v8a']);
        }
    }, []);

    const setEncrypted = (checked: boolean) => {
        set('encrypted', checked);
        if (!checked) {
            set('compressZip', false);
        }
    };
    const toggleAbi = (abi: AppABI, checked: boolean) => {
        const next = checked ? [...appABIs, abi] : appABIs.filter((item) => item !== abi);
        set('appABIs', Array.from(new Set(next)));
    };

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label={t('options.appABIs')} tooltip={t('tips.appABIs')}>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {APP_ABIS.map((abi) => (
                            <label key={abi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Checkbox checked={appABIs.includes(abi)} onCheckedChange={(checked: boolean) => toggleAbi(abi, !!checked)} />
                                <span>{abi}</span>
                            </label>
                        ))}
                    </div>
                </TypedField>
                {!appABIs.length && <div style={ERROR}>{t('tips.at_least_one')}</div>}
            </div>

            <div style={ROW}>
                <TypedField label={t('encrypt.title')} tooltip={isDebugMode ? t('encrypt.disable_tips') : undefined}>
                    <div style={isDebugMode ? DISABLED_BLOCK : undefined}>
                        <Checkbox checked={encrypted} onCheckedChange={(checked: boolean) => setEncrypted(!!checked)} />
                    </div>
                </TypedField>
                {isDebugMode && encrypted && <div style={INFO}>{t('encrypt.disable_tips')}</div>}
            </div>

            {encrypted && (
                <>
                    <div style={ROW}>
                        <TypedField label={t('encrypt.encrypt_key')}>
                            <input
                                style={INPUT}
                                disabled={isDebugMode}
                                value={xxteaKey}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => set('xxteaKey', event.target.value)}
                            />
                        </TypedField>
                        {!xxteaKey && <div style={ERROR}>{t('tips.not_empty')}</div>}
                    </div>
                    <div style={ROW}>
                        <TypedField label={t('encrypt.compress_zip')}>
                            <div style={isDebugMode ? DISABLED_BLOCK : undefined}>
                                <Checkbox checked={compressZip} onCheckedChange={(checked: boolean) => set('compressZip', !!checked)} />
                            </div>
                        </TypedField>
                    </div>
                </>
            )}

            <div style={ROW}>
                <TypedField label={t('options.JobSystem')} tooltip={jobSystem === 'taskFlow' ? t('tips.JobSystemTaskFlow') : t('tips.JobSystemOther')}>
                    <select
                        style={SELECT}
                        value={jobSystem}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) => set('JobSystem', event.target.value)}
                    >
                        <option value="none">{t('options.none')}</option>
                        <option value="tbb">TBB</option>
                        <option value="taskFlow">TaskFlow</option>
                    </select>
                </TypedField>
                {jobSystem === 'taskFlow' && <div style={INFO}>{t('tips.JobSystemTaskFlow')}</div>}
            </div>
        </div>
    );
}
