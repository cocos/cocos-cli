import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Checkbox, FilePicker, TypedField } from '@pink/ui-kit';

export interface PlatformBuildViewProps {
    value: Record<string, unknown>;
    onChange: (path: string[], value: unknown) => void;
    bridge?: {
        invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
    };
}

const DEFAULTS: Record<string, unknown> = {
    apiLevel: 35,
    useDebugKeystore: true,
    keystorePath: '',
    keystorePassword: '',
    keystoreAlias: '',
    keystoreAliasPassword: '',
    resizeableActivity: true,
    maxAspectRatio: '2.4',
};

const MAX_ASPECT_RATIO_OPTIONS = [
    { label: '2.4 (12:5)', value: '2.4' },
    { label: '1.77 (16:9)', value: '16:9' },
    { label: '1.6 (16:10)', value: '16:10' },
    { label: '1.33 (4:3)', value: '4:3' },
];

const ROW: CSSProperties = { padding: '2px 16px 6px 0' };
const STACK: CSSProperties = { display: 'grid', gap: 6 };
const INPUT: CSSProperties = {
    width: '100%', minWidth: 0, boxSizing: 'border-box', height: 26, padding: '0 8px',
    border: '1px solid var(--vscode-input-border, transparent)', color: 'var(--vscode-input-foreground)',
    background: 'var(--vscode-input-background)', outline: 'none',
};
const SELECT: CSSProperties = { ...INPUT, padding: '0 6px' };
const BUTTON: CSSProperties = {
    height: 26, padding: '0 10px', border: '1px solid var(--vscode-button-border, transparent)',
    color: 'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))',
    background: 'var(--vscode-button-secondaryBackground, var(--vscode-button-background))', cursor: 'pointer',
};
const ERROR: CSSProperties = { paddingTop: 3, fontSize: 11, lineHeight: '16px', color: 'var(--vscode-errorForeground, #f14c4c)' };

function translate(bundle: Record<string, unknown>, key: string): string {
    let current: unknown = bundle;
    for (const segment of key.split('.')) {
        if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
            return key;
        }
        current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' ? current : key;
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

function extractFilePickerPath(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return extractFilePickerPath(value[0]);
    if (typeof value === 'object') {
        const item = value as { fsPath?: unknown; path?: unknown; value?: unknown; uri?: { fsPath?: unknown; path?: unknown } };
        return extractFilePickerPath(item.fsPath || item.path || item.value || item.uri?.fsPath || item.uri?.path);
    }
    return '';
}

function aspectRatioSelection(value: string): string {
    return MAX_ASPECT_RATIO_OPTIONS.some((option) => option.value === value) ? value : 'custom';
}

function TextField({ label, value, disabled, password, onChange }: {
    label: string; value: unknown; disabled?: boolean; password?: boolean; onChange: (value: string) => void;
}) {
    return <div style={ROW}><TypedField label={label}><input style={INPUT} type={password ? 'password' : 'text'} value={stringValue(value)} disabled={disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} /></TypedField></div>;
}

export default function HuaweiAgcBuildView({ value, onChange, bridge }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [apiLevels, setApiLevels] = useState<number[]>([]);
    const [aspectRatioMode, setAspectRatioMode] = useState('');
    const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
    const useDebugKeystore = boolValue(current.useDebugKeystore, true);
    const resizeableActivity = boolValue(current.resizeableActivity, true);
    const maxAspectRatio = stringValue(current.maxAspectRatio);
    const selectedAspectRatioMode = aspectRatioMode || aspectRatioSelection(maxAspectRatio);
    const t = (key: string) => translate(bundle, key);
    const set = (key: string, next: unknown) => onChange([key], next);

    useEffect(() => {
        if (!bridge) return;
        let cancelled = false;
        void bridge.invoke<Record<string, unknown>>('getI18nBundle').then((data) => !cancelled && setBundle(data || {}));
        void bridge.invoke<number[]>('getAndroidAPILevels').then((levels) => !cancelled && setApiLevels(levels || []));
        return () => { cancelled = true; };
    }, [bridge]);

    const setUseDebugKeystore = (checked: boolean) => {
        set('useDebugKeystore', checked);
        if (checked) {
            set('keystorePath', '');
            set('keystorePassword', '');
            set('keystoreAlias', '');
            set('keystoreAliasPassword', '');
        }
    };

    const changeAspectRatio = (next: string) => {
        setAspectRatioMode(next);
        if (next !== 'custom') set('maxAspectRatio', next);
    };

    return <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div style={ROW}><TypedField label={t('options.apiLevel')}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}><select style={SELECT} value={String(numberValue(current.apiLevel, apiLevels[0] || 35))} onChange={(event: ChangeEvent<HTMLSelectElement>) => set('apiLevel', Number.parseInt(event.target.value, 10))}>{(apiLevels.length ? apiLevels : [numberValue(current.apiLevel, 35)]).map((level) => <option key={level} value={level}>android-{level}</option>)}</select><button style={BUTTON} type="button" onClick={() => void bridge?.invoke('openProgramSettings')}>Set Android SDK</button></div></TypedField></div>
        <div style={ROW}><TypedField label={t('KEYSTORE.use_debug_keystore')}><Checkbox checked={useDebugKeystore} onCheckedChange={(checked: boolean) => setUseDebugKeystore(!!checked)} /></TypedField></div>
        <div style={ROW}><TypedField label={t('KEYSTORE.keystore_path')}><FilePicker disabled={useDebugKeystore} value={current.keystorePath} buttonText={t('KEYSTORE.keystore_path')} onChange={(next: unknown) => set('keystorePath', extractFilePickerPath(next))} /></TypedField></div>
        <TextField label={t('KEYSTORE.keystore_password')} password disabled={useDebugKeystore} value={current.keystorePassword} onChange={(next) => set('keystorePassword', next)} />
        <TextField label={t('KEYSTORE.keystore_alias')} disabled={useDebugKeystore} value={current.keystoreAlias} onChange={(next) => set('keystoreAlias', next)} />
        <TextField label={t('KEYSTORE.keystore_alias_password')} password disabled={useDebugKeystore} value={current.keystoreAliasPassword} onChange={(next) => set('keystoreAliasPassword', next)} />
        <div style={ROW}><TypedField label={t('options.resizeable_activity')}><Checkbox checked={resizeableActivity} onCheckedChange={(checked: boolean) => set('resizeableActivity', !!checked)} /></TypedField></div>
        <div style={ROW}><TypedField label={t('options.max_aspect_ratio')}><div style={STACK}><select style={SELECT} disabled={resizeableActivity} value={selectedAspectRatioMode} onChange={(event: ChangeEvent<HTMLSelectElement>) => changeAspectRatio(event.target.value)}>{MAX_ASPECT_RATIO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value="custom">{t('options.customOption')}</option></select>{selectedAspectRatioMode === 'custom' && <input style={INPUT} disabled={resizeableActivity} value={maxAspectRatio} onChange={(event: ChangeEvent<HTMLInputElement>) => set('maxAspectRatio', event.target.value)} />}</div></TypedField></div>
    </div>;
}
