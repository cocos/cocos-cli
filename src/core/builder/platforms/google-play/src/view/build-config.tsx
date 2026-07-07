import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
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

type AppABI = 'armeabi-v7a' | 'arm64-v8a' | 'x86' | 'x86_64';
type RenderBackEndKey = 'vulkan' | 'gles3' | 'gles2';
type OrientationKey = 'portrait' | 'landscapeLeft' | 'landscapeRight' | 'upsideDown';
type CustomIconType = 'default' | 'custom';

const APP_ABIS: AppABI[] = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];
const MAX_ASPECT_RATIO_OPTIONS = [
    { label: '2.4 (12:5)', value: '2.4' },
    { label: '1.77 (16:9)', value: '16:9' },
    { label: '1.6 (16:10)', value: '16:10' },
    { label: '1.33 (4:3)', value: '4:3' },
];

const DEFAULTS: Record<string, unknown> = {
    packageName: 'com.cocos.game',
    resizeableActivity: true,
    maxAspectRatio: '2.4',
    orientation: {
        portrait: false,
        upsideDown: false,
        landscapeRight: true,
        landscapeLeft: true,
    },
    apiLevel: 35,
    appABIs: ['arm64-v8a'],
    useDebugKeystore: true,
    keystorePath: '',
    keystorePassword: '',
    keystoreAlias: '',
    keystoreAliasPassword: '',
    appBundle: true,
    androidInstant: false,
    googleBilling: true,
    playGames: true,
    inputSDK: false,
    isSoFileCompressed: false,
    remoteUrl: '',
    renderBackEnd: {
        vulkan: false,
        gles3: true,
        gles2: true,
    },
    swappy: false,
    adpf: true,
    customIcon: 'default',
};

const ROW: CSSProperties = { padding: '2px 16px 6px 0px' };
const STACK: CSSProperties = { display: 'grid', gap: 6 };
const INLINE: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const SUB_ROW: CSSProperties = { paddingLeft: 18, display: 'grid', gap: 4 };
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
    color: 'var(--vscode-button-foreground)',
    background: 'var(--vscode-button-background)',
    cursor: 'pointer',
};
const BUTTON_SECONDARY: CSSProperties = {
    ...BUTTON,
    color: 'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))',
    background: 'var(--vscode-button-secondaryBackground, var(--vscode-button-background))',
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
const ICON_PREVIEW: CSSProperties = {
    width: 84,
    height: 84,
    objectFit: 'contain',
    border: '1px solid var(--vscode-panel-border, rgba(127,127,127,.35))',
    background: 'var(--vscode-editor-background)',
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

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function appABIsValue(value: unknown): AppABI[] {
    if (!Array.isArray(value)) {
        return ['arm64-v8a'];
    }
    return value.filter((item): item is AppABI => APP_ABIS.includes(item as AppABI));
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

async function fileImageSrc(filePath: string, bridge?: PlatformBuildViewProps['bridge']): Promise<string> {
    if (!filePath) {
        return '';
    }
    if (filePath.startsWith('data:image/')) {
        return filePath;
    }
    if (!bridge) {
        return '';
    }
    return bridge.invoke<string>('fileImageSrc', filePath);
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
    tooltip,
    value,
    disabled,
    password,
    placeholder,
    error,
    onChange,
}: {
    label: string;
    tooltip?: string;
    value: unknown;
    disabled?: boolean;
    password?: boolean;
    placeholder?: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div style={ROW}>
            <TypedField label={label} tooltip={tooltip}>
                <input
                    style={INPUT}
                    type={password ? 'password' : 'text'}
                    value={stringValue(value)}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                />
            </TypedField>
            {error && <div style={ERROR}>{error}</div>}
        </div>
    );
}

function CheckboxLine({
    checked,
    disabled,
    label,
    tooltip,
    onChange,
}: {
    key?: unknown;
    checked: boolean;
    disabled?: boolean;
    label?: string;
    tooltip?: string;
    onChange: (value: boolean) => void;
}) {
    return (
        <label style={{ ...INLINE, minHeight: 22 }} title={tooltip}>
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(next: boolean) => onChange(!!next)} />
            {label && <span>{label}</span>}
        </label>
    );
}

export default function GooglePlayBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [apiLevels, setApiLevels] = useState<number[]>([]);
    const [iconDisplay, setIconDisplay] = useState('');
    const [iconPreviewSrc, setIconPreviewSrc] = useState('');
    const [maxAspectRatioMode, setMaxAspectRatioMode] = useState('');
    const [customMaxAspectRatio, setCustomMaxAspectRatio] = useState('');
    const [customError, setCustomError] = useState('');
    const iconDisplayRequestRef = useRef('');

    const t = (key: string, sub?: Record<string, unknown>) => formatMessage(translate(bundle, key), sub);
    const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
    const renderBackEnd = { ...(DEFAULTS.renderBackEnd as Record<string, boolean>), ...objectValue(current.renderBackEnd) };
    const orientation = { ...(DEFAULTS.orientation as Record<string, boolean>), ...objectValue(current.orientation) };
    const appABIs = appABIsValue(current.appABIs);
    const resizeableActivity = boolValue(current.resizeableActivity, true);
    const androidInstant = boolValue(current.androidInstant);
    const useDebugKeystore = boolValue(current.useDebugKeystore, true);
    const maxAspectRatio = stringValue(current.maxAspectRatio);
    const outputName = stringValue(commonValue?.outputName) || 'google-play';
    const customIconType: CustomIconType = current.customIcon === 'custom' ? 'custom' : 'default';
    const inferredMaxAspectRatioMode = maxAspectRatioSelection(maxAspectRatio);
    const selectedMaxAspectRatioMode = maxAspectRatioMode || inferredMaxAspectRatioMode;

    const set = (key: string, next: unknown) => onChange([key], next);
    const setRenderBackEnd = (key: RenderBackEndKey, next: boolean) => {
        const nextValue = { ...renderBackEnd, [key]: next };
        onChange(['renderBackEnd'], nextValue);
    };
    const setOrientation = (key: OrientationKey, next: boolean) => {
        const nextValue = { ...orientation, [key]: next };
        onChange(['orientation'], nextValue);
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
        return () => {
            cancelled = true;
        };
    }, [bridge]);

    useEffect(() => {
        let cancelled = false;
        fileImageSrc(iconDisplay, bridge)
            .then((src) => {
                if (!cancelled) {
                    setIconPreviewSrc(src);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setIconPreviewSrc('');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [bridge, iconDisplay]);

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
        const packageName = stringValue(current.packageName);
        if (!packageName) {
            next.packageName = t('tips.not_empty');
        } else if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName)) {
            next.packageName = t('tips.package_name_error');
        }
        if (!appABIs.length) {
            next.appABIs = t('tips.at_least_one');
        }
        if (!Object.values(renderBackEnd).some(Boolean)) {
            next.renderBackEnd = t('tips.at_least_one');
        }
        if (!Object.values(orientation).some(Boolean)) {
            next.orientation = t('tips.at_least_one');
        }
        const apiLevel = numberValue(current.apiLevel, 0);
        if (!apiLevels.length) {
            next.apiLevel = t('tips.apilevel_empty');
        } else if (androidInstant && apiLevel < 23) {
            next.apiLevel = `${t('tips.when_enable_instant')}${t('tips.apilevel_limit', { version: '23' })}`;
        } else if (String(commonValue?.JobSystem || '') === 'tbb' && apiLevel < 21) {
            next.apiLevel = `${t('tips.when_enable_tbb')}${t('tips.apilevel_limit', { version: '21' })}`;
        } else if (apiLevel < 19) {
            next.apiLevel = t('tips.apilevel_limit', { version: '19' });
        }
        if (!resizeableActivity) {
            const normalized = normalizeAspectRatio(maxAspectRatio);
            const ratio = parseAspectRatio(normalized);
            if (!normalized) {
                next.maxAspectRatio = t('tips.mar_empty');
            } else if (!Number.isFinite(ratio)) {
                next.maxAspectRatio = t('tips.mar_format');
            } else if (ratio < 1.33) {
                next.maxAspectRatio = t('tips.mar_bad_value');
            }
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
        if (androidInstant) {
            const remoteUrl = stringValue(current.remoteUrl);
            if (remoteUrl && !remoteUrl.startsWith('http')) {
                next.remoteUrl = 'remoteUrl should start with http';
            }
        }
        return next;
    }, [apiLevels.length, androidInstant, appABIs, bundle, commonValue?.JobSystem, current, maxAspectRatio, orientation, renderBackEnd, resizeableActivity, t, useDebugKeystore]);

    const toggleAbi = (abi: AppABI, checked: boolean) => {
        const next = checked ? [...appABIs, abi] : appABIs.filter((item) => item !== abi);
        set('appABIs', Array.from(new Set(next)));
    };
    const setUseDebugKeystore = (checked: boolean) => {
        set('useDebugKeystore', checked);
        if (checked) {
            set('keystorePath', '');
            set('keystorePassword', '');
            set('keystoreAlias', '');
            set('keystoreAliasPassword', '');
        }
    };
    const refreshIconDisplay = async (type: CustomIconType, cancelled?: () => boolean) => {
            console.log('refreshIconDisplay11');
        if (!bridge) {
            iconDisplayRequestRef.current = '';
            setIconDisplay('');
            return;
        }
        const requestKey = `${type}:${outputName}`;
        if (iconDisplayRequestRef.current === requestKey) {
            return;
        }
        iconDisplayRequestRef.current = requestKey;
        try {
            const display = await bridge.invoke<string>('getDisplayCustomIcon', type, outputName);
            console.log('refreshIconDisplay', display, type, outputName);
            if (!cancelled?.()) {
                setIconDisplay(display || '');
                setCustomError('');
            }
        } catch (error) {
            if (!cancelled?.()) {
                setIconDisplay('');
                setCustomError(error instanceof Error ? error.message : String(error));
            }
        }
    };
    useEffect(() => {
        iconDisplayRequestRef.current = '';
    }, [bridge]);
    useEffect(() => {
        let cancelled = false;
        void refreshIconDisplay(customIconType, () => cancelled);
        return () => {
            cancelled = true;
        };
    }, [bridge, customIconType, outputName]);
    const changeCustomIconType = async (type: CustomIconType) => {
        set('customIcon', type);
        await refreshIconDisplay(type);
    };
    const applyCustomIcon = async (value: unknown) => {
        const source = extractFilePickerPath(value);
        if (!source) {
            return;
        }
        setCustomError('');
        try {
            const display = await bridge?.invoke<string>('saveCustomIcon', source, outputName);
            iconDisplayRequestRef.current = `custom:${outputName}`;
            set('customIcon', 'custom');
            setIconDisplay(display || '');
        } catch (error) {
            setCustomError(error instanceof Error ? error.message : String(error));
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

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label={t('options.render_back_end')}>
                    <div style={STACK}>
                        <CheckboxLine
                            checked={!!renderBackEnd.vulkan}
                            tooltip={t('tips.vukan_limit')}
                            label="Vulkan"
                            onChange={(checked) => setRenderBackEnd('vulkan', checked)}
                        />
                        <CheckboxLine
                            checked={!!renderBackEnd.gles3}
                            label="GLES 2/3"
                            onChange={(checked) => {
                                onChange(['renderBackEnd'], checked
                                    ? { ...renderBackEnd, gles3: true }
                                    : { ...renderBackEnd, gles2: false, gles3: false });
                            }}
                        />
                        {!!renderBackEnd.gles3 && (
                            <div style={SUB_ROW}>
                                <CheckboxLine checked={true} disabled={true} label="GLES3" onChange={() => {}} />
                                <CheckboxLine checked={!!renderBackEnd.gles2} label="GLES2" onChange={(checked) => setRenderBackEnd('gles2', checked)} />
                            </div>
                        )}
                    </div>
                </TypedField>
                {errors.renderBackEnd && <div style={ERROR}>{errors.renderBackEnd}</div>}
            </div>

            <TextField
                label={t('options.package_name')}
                value={current.packageName}
                placeholder={t('options.package_name_hint')}
                error={errors.packageName}
                onChange={(next) => set('packageName', next)}
            />

            <div style={ROW}>
                <TypedField label={t('custom_icon.title')} tooltip={t('custom_icon.tooltip')}>
                    <div style={STACK}>
                        <CheckboxLine checked={current.customIcon !== 'custom'} label={t('custom_icon.default')} onChange={(checked) => { if (checked) void changeCustomIconType('default'); }} />
                        <CheckboxLine checked={current.customIcon === 'custom'} label={t('custom_icon.custom')} onChange={(checked) => { if (checked) void changeCustomIconType('custom'); }} />
                        <div style={INLINE}>
                            {current.customIcon === 'custom' && (
                                <FilePicker
                                    value={iconDisplay.split('?')[0] || ''}
                                    filters={{ Images: ['png'] }}
                                    placeholder={t('custom_icon.btnSelectImage')}
                                    onChange={(next: unknown) => { void applyCustomIcon(next); }}
                                />
                            )}
                            {iconPreviewSrc && <img alt="" src={iconPreviewSrc} style={ICON_PREVIEW} />}
                        </div>
                    </div>
                </TypedField>
                {customError && <div style={ERROR}>{customError}</div>}
            </div>

            <div style={ROW}>
                <TypedField label="Target API Level">
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
                        <button style={BUTTON_SECONDARY} type="button" onClick={() => void bridge?.invoke('openProgramSettings')}>
                            Set Android SDK
                        </button>
                    </div>
                </TypedField>
                {errors.apiLevel && <div style={ERROR}>{errors.apiLevel}</div>}
            </div>

            <div style={ROW}>
                <TypedField label="APP ABI" tooltip={t('options.appABIs_tips')}>
                    <div style={STACK}>
                        {APP_ABIS.map((abi) => (
                            <CheckboxLine key={abi} checked={appABIs.includes(abi)} label={abi} onChange={(checked) => toggleAbi(abi, checked)} />
                        ))}
                    </div>
                </TypedField>
                {errors.appABIs && <div style={ERROR}>{errors.appABIs}</div>}
            </div>

            <div style={ROW}>
                <TypedField label={t('KEYSTORE.use_debug_keystore')}>
                    <Checkbox checked={useDebugKeystore} onCheckedChange={(checked: boolean) => setUseDebugKeystore(!!checked)} />
                </TypedField>
            </div>

            <div style={ROW}>
                <TypedField label={t('KEYSTORE.keystore_path')}>
                    <FilePicker
                        disabled={useDebugKeystore} value={current.keystorePath} buttonText={t('KEYSTORE.keystore_path')} onChange={(next:any) => set('keystorePath', next)}
                    />
                </TypedField>
            </div>
            <TextField label={t('KEYSTORE.keystore_password')} password disabled={useDebugKeystore} value={current.keystorePassword} error={errors.keystorePassword} onChange={(next) => set('keystorePassword', next)} />
            <TextField label={t('KEYSTORE.keystore_alias')} disabled={useDebugKeystore} value={current.keystoreAlias} error={errors.keystoreAlias} onChange={(next) => set('keystoreAlias', next)} />
            <TextField label={t('KEYSTORE.keystore_alias_password')} password disabled={useDebugKeystore} value={current.keystoreAliasPassword} error={errors.keystoreAliasPassword} onChange={(next) => set('keystoreAliasPassword', next)} />

            <div style={ROW}>
                <TypedField label={t('options.resizeable_activity')} tooltip={t('tips.resizeable_activity')}>
                    <Checkbox checked={resizeableActivity} onCheckedChange={(checked: boolean) => set('resizeableActivity', !!checked)} />
                </TypedField>
            </div>

            <div style={ROW}>
                <TypedField label={t('options.max_aspect_ratio')}>
                    <div style={STACK}>
                        <select
                            style={SELECT}
                            disabled={resizeableActivity}
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
                                disabled={resizeableActivity}
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
                <TypedField label={t('options.screen_orientation')}>
                    <div style={STACK}>
                        <CheckboxLine checked={!!orientation.portrait} label={t('options.portrait')} tooltip={t('tips.orientation_portrait')} onChange={(checked) => setOrientation('portrait', checked)} />
                        <CheckboxLine checked={!!orientation.landscapeLeft} label={t('options.landscape_left')} tooltip={t('tips.orientation_landscape_left')} onChange={(checked) => setOrientation('landscapeLeft', checked)} />
                        <CheckboxLine checked={!!orientation.landscapeRight} label={t('options.landscape_right')} tooltip={t('tips.orientation_landscape_right')} onChange={(checked) => setOrientation('landscapeRight', checked)} />
                        <CheckboxLine checked={!!orientation.upsideDown} label={t('options.upsideDown')} onChange={(checked) => setOrientation('upsideDown', checked)} />
                    </div>
                </TypedField>
                {errors.orientation && <div style={ERROR}>{errors.orientation}</div>}
            </div>

            <div style={ROW}>
                <TypedField label="Google Play Instant" tooltip={t('tips.google_play_instant')}>
                    <Checkbox checked={androidInstant} onCheckedChange={(checked: boolean) => set('androidInstant', !!checked)} />
                </TypedField>
                {androidInstant && <div style={INFO}>{t('tips.when_enable_instant')}{t('tips.apilevel_limit', { version: '23' })}</div>}
            </div>

            {androidInstant && (
                <TextField
                    label={t('options.intent_filter')}
                    value={current.remoteUrl}
                    placeholder="https://www.cocos.com/assets"
                    error={errors.remoteUrl}
                    onChange={(next) => set('remoteUrl', next)}
                />
            )}

            <div style={ROW}>
                <TypedField label="Built in Play Billing" tooltip={t('tips.google_play_billing')}>
                    <Checkbox checked={boolValue(current.googleBilling, true)} onCheckedChange={(checked: boolean) => set('googleBilling', !!checked)} />
                </TypedField>
            </div>
            <div style={ROW}>
                <TypedField label="Input SDK" tooltip={t('tips.input_sdk')}>
                    <Checkbox checked={boolValue(current.inputSDK)} onCheckedChange={(checked: boolean) => set('inputSDK', !!checked)} />
                </TypedField>
            </div>
            <div style={ROW}>
                <TypedField label="Compress .so files" tooltip={t('tips.compress_so_files')}>
                    <Checkbox checked={boolValue(current.isSoFileCompressed)} onCheckedChange={(checked: boolean) => set('isSoFileCompressed', !!checked)} />
                </TypedField>
            </div>
        </div>
    );
}
