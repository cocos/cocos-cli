import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Checkbox, FilePicker, TypedField } from '@pink/ui-kit';

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

interface NativeEngineInfo {
    type?: string;
    path?: string;
}

const MAX_ASPECT_RATIO_OPTIONS = [
    { label: '2.4 (12:5)', value: '2.4' },
    { label: '1.77 (16:9)', value: '16:9' },
    { label: '1.6 (16:10)', value: '16:10' },
    { label: '1.33 (4:3)', value: '4:3' },
];

function createEncryptionKey(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const DEFAULTS: Record<string, unknown> = {
    apiLevel: 35,
    androidInstant: false,
    useDebugKeystore: true,
    keystorePath: '',
    keystorePassword: '',
    keystoreAlias: '',
    keystoreAliasPassword: '',
    maxAspectRatio: '2.4',
    isSoFileCompressed: true,
    encrypted: false,
    xxteaKey: createEncryptionKey(),
    compressZip: false,
    JobSystem: 'none',
};

const ROW: CSSProperties = { padding: '2px 16px 6px 0px' };
const STACK: CSSProperties = { display: 'grid', gap: 6 };
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
const INLINE: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 };
const PATH_TEXT: CSSProperties = {
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
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

function numberValue(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAspectRatio(value: string): number {
    if (!value) {
        return 0;
    }
    const fraction = value.match(/^(\d+):(\d+)$/);
    if (fraction) {
        return Number.parseInt(fraction[1], 10) / Number.parseInt(fraction[2], 10);
    }
    const formatted = value.match(/^\s*(\d+(?:\.\d+)?)\s*(?:\(\s*(\d+)\s*:\s*(\d+)\s*\))?\s*$/);
    if (formatted?.[2] && formatted?.[3]) {
        return Number.parseInt(formatted[2], 10) / Number.parseInt(formatted[3], 10);
    }
    return Number.parseFloat(value);
}

function normalizeAspectRatio(value: string): string {
    const text = value.trim();
    const fraction = text.match(/^(\d+):(\d+)$/);
    if (fraction) {
        return `${fraction[1]}:${fraction[2]}`;
    }
    const formatted = text.match(/^(\d+(?:\.\d+)?)\s*(?:\(\s*(\d+)\s*:\s*(\d+)\s*\))?$/);
    if (formatted?.[2] && formatted?.[3]) {
        return `${formatted[2]}:${formatted[3]}`;
    }
    return formatted?.[1] || text;
}

function formatCustomAspectRatio(value: string): string {
    const fraction = value.match(/^(\d+):(\d+)$/);
    if (fraction) {
        const width = Number.parseInt(fraction[1], 10);
        const height = Number.parseInt(fraction[2], 10);
        return `${(width / height).toFixed(2)} (${width}:${height})`;
    }
    return value;
}

function maxAspectRatioSelection(value: string): string {
    const current = parseAspectRatio(value);
    const predefined = MAX_ASPECT_RATIO_OPTIONS.find((option) => parseAspectRatio(option.value) === current);
    return predefined?.value || 'custom';
}

function extractFilePickerPath(value: unknown): string {
    if (!value) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return extractFilePickerPath(value[0]);
    }
    if (typeof value === 'object') {
        const data = value as Record<string, unknown>;
        const target = data.target as Record<string, unknown> | undefined;
        if (target) {
            return extractFilePickerPath(target.value ?? target.files);
        }
        for (const key of ['path', 'fsPath', 'filePath', 'value']) {
            const path = extractFilePickerPath(data[key]);
            if (path) {
                return path;
            }
        }
    }
    return '';
}

function TextField({
    label,
    value,
    disabled,
    password,
    error,
    onChange,
}: {
    label: string;
    value: unknown;
    disabled?: boolean;
    password?: boolean;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div style={ROW}>
            <TypedField label={label}>
                <input
                    style={INPUT}
                    type={password ? 'password' : 'text'}
                    value={stringValue(value)}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                />
            </TypedField>
            {error && <div style={ERROR}>{error}</div>}
        </div>
    );
}

export default function AndroidBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [apiLevels, setApiLevels] = useState<number[]>([]);
    const [maxAspectRatioMode, setMaxAspectRatioMode] = useState('');
    const [customMaxAspectRatio, setCustomMaxAspectRatio] = useState('');
    const [nativeEngine, setNativeEngine] = useState<NativeEngineInfo>({ type: 'builtin', path: '' });

    const t = (key: string, sub?: Record<string, unknown>) => formatMessage(translate(bundle, key), sub);
    const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
    const androidInstant = boolValue(current.androidInstant);
    const useDebugKeystore = boolValue(current.useDebugKeystore, true);
    const encrypted = boolValue(current.encrypted);
    const compressZip = boolValue(current.compressZip);
    const isDebugMode = boolValue(commonValue?.debug);
    const maxAspectRatio = stringValue(current.maxAspectRatio);
    const jobSystem = stringValue(current.JobSystem) || 'none';
    const inferredMaxAspectRatioMode = maxAspectRatioSelection(maxAspectRatio);
    const selectedMaxAspectRatioMode = maxAspectRatioMode || inferredMaxAspectRatioMode;

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
        bridge.invoke<number[]>('getAndroidAPILevels')
            .then((levels) => {
                if (!cancelled) {
                    setApiLevels(Array.isArray(levels) ? levels : []);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setApiLevels([]);
                }
            });
        bridge.invoke<NativeEngineInfo>('getNativeEngineInfo')
            .then((info) => {
                if (!cancelled) {
                    setNativeEngine(info ?? { type: 'builtin', path: '' });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setNativeEngine({ type: 'builtin', path: '' });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [bridge]);

    useEffect(() => {
        if (inferredMaxAspectRatioMode === 'custom') {
            setMaxAspectRatioMode('custom');
            setCustomMaxAspectRatio(formatCustomAspectRatio(maxAspectRatio));
        } else if (maxAspectRatioMode !== 'custom') {
            setMaxAspectRatioMode(inferredMaxAspectRatioMode);
        }
    }, [inferredMaxAspectRatioMode, maxAspectRatio, maxAspectRatioMode]);

    useEffect(() => {
        for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
            if (!(key in value)) {
                onChange([key], defaultValue);
            }
        }
    }, []);

    const errors = useMemo(() => {
        const next: Record<string, string> = {};
        const apiLevel = numberValue(current.apiLevel, 0);
        if (!apiLevels.length) {
            next.apiLevel = t('tips.apilevel_empty');
        } else if (androidInstant && apiLevel < 23) {
            next.apiLevel = `${t('tips.when_enable_instant')}${t('tips.apilevel_limit', { version: '23' })}`;
        } else if (jobSystem === 'tbb' && apiLevel < 21) {
            next.apiLevel = `${t('tips.when_enable_tbb')}${t('tips.apilevel_limit', { version: '21' })}`;
        } else if (apiLevel < 19) {
            next.apiLevel = t('tips.apilevel_limit', { version: '19' });
        }

        const normalized = normalizeAspectRatio(maxAspectRatio);
        const ratio = parseAspectRatio(normalized);
        if (!normalized) {
            next.maxAspectRatio = t('tips.mar_empty');
        } else if (!Number.isFinite(ratio)) {
            next.maxAspectRatio = t('tips.mar_format');
        } else if (ratio < 1.33) {
            next.maxAspectRatio = t('tips.mar_bad_value');
        }

        if (!useDebugKeystore) {
            if (!stringValue(current.keystorePath)) {
                next.keystorePath = t('KEYSTORE.error.keystore_path_empty');
            }
            for (const key of ['keystorePassword', 'keystoreAlias', 'keystoreAliasPassword']) {
                if (!stringValue(current[key])) {
                    next[key] = t('tips.not_empty');
                }
            }
        }
        if (encrypted && !stringValue(current.xxteaKey)) {
            next.xxteaKey = t('tips.not_empty');
        }
        return next;
    }, [apiLevels.length, androidInstant, bundle, current, encrypted, jobSystem, maxAspectRatio, t, useDebugKeystore]);

    const setUseDebugKeystore = (checked: boolean) => {
        set('useDebugKeystore', checked);
        if (checked) {
            set('keystorePath', '');
            set('keystorePassword', '');
            set('keystoreAlias', '');
            set('keystoreAliasPassword', '');
        }
    };
    const changeMaxAspectRatio = (next: string) => {
        if (next === 'custom') {
            setMaxAspectRatioMode('custom');
            set('maxAspectRatio', normalizeAspectRatio(customMaxAspectRatio));
            return;
        }
        setMaxAspectRatioMode(next);
        set('maxAspectRatio', next);
    };
    const commitCustomMaxAspectRatio = (next: string) => {
        setCustomMaxAspectRatio(next);
        set('maxAspectRatio', normalizeAspectRatio(next));
    };
    const setEncrypted = (checked: boolean) => {
        set('encrypted', checked);
        if (!checked) {
            set('compressZip', false);
        }
    };

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label={t('options.native_engine')}>
                    <div style={INLINE}>
                        <div style={PATH_TEXT} title={nativeEngine.type === 'custom' ? stringValue(nativeEngine.path) : t('options.builtin_engine')}>
                            {nativeEngine.type === 'custom' && nativeEngine.path ? nativeEngine.path : t('options.builtin_engine')}
                        </div>
                        <button style={BUTTON} type="button" onClick={() => void bridge?.invoke('openEngineSettings')}>
                            {t('options.edit')}
                        </button>
                    </div>
                </TypedField>
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

            <div style={ROW}>
                <TypedField label={t('options.apiLevel')}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                        <select
                            style={SELECT}
                            value={String(numberValue(current.apiLevel, apiLevels[0] || 35))}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => set('apiLevel', Number.parseInt(event.target.value, 10))}
                        >
                            {(apiLevels.length ? apiLevels : [numberValue(current.apiLevel, 35)]).map((level) => (
                                <option key={level} value={level}>android-{level}</option>
                            ))}
                        </select>
                        <button style={BUTTON} type="button" onClick={() => void bridge?.invoke('openProgramSettings')}>
                            Set Android SDK
                        </button>
                    </div>
                </TypedField>
                {errors.apiLevel && <div style={ERROR}>{errors.apiLevel}</div>}
            </div>

            <div style={ROW}>
                <TypedField label={t('KEYSTORE.use_debug_keystore')}>
                    <Checkbox checked={useDebugKeystore} onCheckedChange={(checked: boolean) => setUseDebugKeystore(!!checked)} />
                </TypedField>
            </div>

            <div style={ROW}>
                <TypedField label={t('KEYSTORE.keystore_path')}>
                    <FilePicker
                        disabled={useDebugKeystore}
                        value={current.keystorePath}
                        buttonText={t('KEYSTORE.keystore_path')}
                        onChange={(next: unknown) => set('keystorePath', extractFilePickerPath(next))}
                    />
                </TypedField>
                {errors.keystorePath && <div style={ERROR}>{errors.keystorePath}</div>}
            </div>
            <TextField label={t('KEYSTORE.keystore_password')} password disabled={useDebugKeystore} value={current.keystorePassword} error={errors.keystorePassword} onChange={(next) => set('keystorePassword', next)} />
            <TextField label={t('KEYSTORE.keystore_alias')} disabled={useDebugKeystore} value={current.keystoreAlias} error={errors.keystoreAlias} onChange={(next) => set('keystoreAlias', next)} />
            <TextField label={t('KEYSTORE.keystore_alias_password')} password disabled={useDebugKeystore} value={current.keystoreAliasPassword} error={errors.keystoreAliasPassword} onChange={(next) => set('keystoreAliasPassword', next)} />

            <div style={ROW}>
                <TypedField label={t('options.max_aspect_ratio')}>
                    <div style={STACK}>
                        <select
                            style={SELECT}
                            value={selectedMaxAspectRatioMode}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => changeMaxAspectRatio(event.target.value)}
                        >
                            {MAX_ASPECT_RATIO_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                            <option value="custom">{t('options.customOption')}</option>
                        </select>
                        {selectedMaxAspectRatioMode === 'custom' && (
                            <input
                                style={INPUT}
                                value={customMaxAspectRatio}
                                placeholder={t('placeholders.max_aspect_ratio')}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => commitCustomMaxAspectRatio(event.target.value)}
                            />
                        )}
                    </div>
                </TypedField>
                {errors.maxAspectRatio && <div style={ERROR}>{errors.maxAspectRatio}</div>}
            </div>

            <div style={ROW}>
                <TypedField label={t('options.google_play_instant')} tooltip={t('tips.google_play_instant')}>
                    <Checkbox checked={androidInstant} onCheckedChange={(checked: boolean) => set('androidInstant', !!checked)} />
                </TypedField>
                {androidInstant && <div style={INFO}>{t('tips.when_enable_instant')}{t('tips.apilevel_limit', { version: '23' })}</div>}
            </div>

            <div style={ROW}>
                <TypedField label={t('options.compress_so_files')} tooltip={t('options.compress_so_files_tips')}>
                    <Checkbox checked={boolValue(current.isSoFileCompressed, true)} onCheckedChange={(checked: boolean) => set('isSoFileCompressed', !!checked)} />
                </TypedField>
            </div>
        </div>
    );
}
