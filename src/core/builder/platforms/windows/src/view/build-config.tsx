import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Checkbox, TypedField } from '@pink/ui-kit';

export interface PlatformBuildViewProps {
    value: Record<string, unknown>;
    onChange: (path: string[], value: unknown) => void;
    host?: unknown;
    bridge?: {
        invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
        on(event: string, listener: (params: unknown) => void): () => void;
    };
    commonValue?: Record<string, unknown>;
}

interface VisualStudioInfo {
    name: string;
    value: string;
}

function createEncryptionKey(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const DEFAULTS: Record<string, unknown> = {
    encrypted: false,
    xxteaKey: createEncryptionKey(),
    compressZip: false,
    JobSystem: 'none',
};

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
const BUTTON: CSSProperties = {
    height: 26,
    padding: '0 10px',
    border: '1px solid var(--vscode-button-border, transparent)',
    color: 'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))',
    background: 'var(--vscode-button-secondaryBackground, var(--vscode-button-background))',
    cursor: 'pointer',
};
const BUTTON_DISABLED: CSSProperties = {
    ...BUTTON,
    opacity: 0.6,
    cursor: 'default',
};
const GRID_WITH_BUTTON: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 8,
};
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

function TextField({
    label,
    value,
    disabled,
    error,
    onChange,
}: {
    label: string;
    value: unknown;
    disabled?: boolean;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div style={ROW}>
            <TypedField label={label}>
                <input
                    style={INPUT}
                    type="text"
                    value={stringValue(value)}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                />
            </TypedField>
            {error && <div style={ERROR}>{error}</div>}
        </div>
    );
}

export default function WindowsBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [vsData, setVsData] = useState<VisualStudioInfo[]>([]);
    const [loadingVS, setLoadingVS] = useState(false);
    const [loadedVS, setLoadedVS] = useState(false);

    const t = (key: string, sub?: Record<string, unknown>) => formatMessage(translate(bundle, key), sub);
    const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
    const encrypted = boolValue(current.encrypted);
    const compressZip = boolValue(current.compressZip);
    const isDebugMode = boolValue(commonValue?.debug);
    const jobSystem = stringValue(current.JobSystem) || 'none';

    const set = (key: string, next: unknown) => onChange([key], next);

    const queryVSData = async (refresh = false) => {
        if (!bridge) {
            setVsData([]);
            setLoadedVS(true);
            return;
        }

        setLoadingVS(true);
        setLoadedVS(false);
        try {
            const data = await bridge.invoke<VisualStudioInfo[]>('queryVisualStudioVersion', refresh);
            const list = Array.isArray(data) ? data : [];
            setVsData(list);
        } catch (error) {
            console.warn(error);
            if (!refresh) {
                setVsData([]);
            }
        } finally {
            setLoadedVS(true);
            setLoadingVS(false);
        }
    };

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
        void queryVSData(false);
    }, [bridge]);

    useEffect(() => {
        for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
            if (!(key in value)) {
                onChange([key], defaultValue);
            }
        }
    }, []);

    const errors = useMemo(() => {
        const next: Record<string, string> = {};
        if (encrypted && !stringValue(current.xxteaKey)) {
            next.xxteaKey = t('tips.not_empty');
        }
        return next;
    }, [bundle, current.xxteaKey, encrypted, t]);

    const setEncrypted = (checked: boolean) => {
        set('encrypted', checked);
        if (!checked) {
            set('compressZip', false);
        }
    };

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label={t('options.cmakeGenerators')}>
                    <div style={GRID_WITH_BUTTON}>
                        <select
                            style={SELECT}
                            value={stringValue(current.vsData)}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => set('vsData', event.target.value)}
                        >
                            <option value=""></option>
                            {vsData.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                        <button
                            style={loadingVS ? BUTTON_DISABLED : BUTTON}
                            type="button"
                            disabled={loadingVS}
                            onClick={() => void queryVSData(true)}
                        >
                            {loadingVS ? t('tips.loading') : t('options.refresh')}
                        </button>
                    </div>
                </TypedField>
                {loadedVS && !vsData.length && <div style={INFO}>{t('tips.visualStudioEmpty')}</div>}
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
                    <TextField
                        label={t('encrypt.encrypt_key')}
                        disabled={isDebugMode}
                        value={current.xxteaKey}
                        error={errors.xxteaKey}
                        onChange={(next) => set('xxteaKey', next)}
                    />
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
