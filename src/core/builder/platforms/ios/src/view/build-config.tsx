import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';
import { TypedField } from '@pink/ui-kit';

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

interface TeamInfo {
    hash: string;
    outputValue: string;
    fullValue: string;
    errorState?: string;
}

interface SelectOption {
    value: string;
    label: string;
    error: string;
}

const ROW: CSSProperties = { padding: '2px 16px 6px 0px' };
const STACK: CSSProperties = { display: 'grid', gap: 6 };
const INLINE: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
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
const BUTTON_SECONDARY: CSSProperties = {
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

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function toOptions(teams: TeamInfo[]): SelectOption[] {
    return teams.map((item) => ({
        value: `${item.outputValue}_${item.hash}`,
        label: item.fullValue,
        error: item.errorState ? `Error: ${item.errorState}` : '',
    }));
}

export default function IOSBuildView({ value, onChange, bridge }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [teams, setTeams] = useState<TeamInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [selected, setSelected] = useState('');

    const t = (key: string) => translate(bundle, key);
    const developerTeam = stringValue(value.developerTeam);
    const options = useMemo(() => toOptions(teams), [teams]);
    const selectedOption = options.find((option) => option.value === selected);
    const showCustom = selected === 'custom' || !options.length;

    const setDeveloperTeam = (next: string) => onChange(['developerTeam'], next);

    const queryTeams = async () => {
        if (!bridge) {
            setTeams([]);
            setLoaded(true);
            return;
        }

        setLoading(true);
        try {
            const data = await bridge.invoke<TeamInfo[]>('queryTeamInfo');
            setTeams(Array.isArray(data) ? data : []);
        } catch (error) {
            console.warn(error);
            setTeams([]);
        } finally {
            setLoaded(true);
            setLoading(false);
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
        void queryTeams();
    }, [bridge]);

    useEffect(() => {
        if (!loaded) {
            return;
        }

        if (!options.length) {
            setSelected('custom');
            return;
        }

        if (developerTeam) {
            setSelected(options.some((option) => option.value === developerTeam) ? developerTeam : 'custom');
            return;
        }

        const firstValid = options.find((option) => !option.error) || options[0];
        setSelected(firstValid.value);
        setDeveloperTeam(firstValid.value);
    }, [developerTeam, loaded, options]);

    const changeDeveloperTeam = (next: string) => {
        setSelected(next);
        setDeveloperTeam(next === 'custom' ? '' : next);
    };

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label={t('options.developerTeam')}>
                    <div style={STACK}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                            <select
                                style={SELECT}
                                value={showCustom ? 'custom' : selected}
                                onChange={(event: ChangeEvent<HTMLSelectElement>) => changeDeveloperTeam(event.target.value)}
                            >
                                {options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                                <option value="custom">{t('options.customOption')}</option>
                            </select>
                            <button style={BUTTON_SECONDARY} type="button" disabled={loading} onClick={() => void queryTeams()}>
                                {loading ? 'Loading...' : t('options.queryAgain')}
                            </button>
                        </div>
                        {showCustom && (
                            <input
                                style={INPUT}
                                value={developerTeam}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setDeveloperTeam(event.target.value)}
                            />
                        )}
                    </div>
                </TypedField>
                {selectedOption?.error && <div style={ERROR}>{selectedOption.error}</div>}
                {loaded && !options.length && <div style={INFO}>{t('tips.developerTeamListError')}</div>}
            </div>
        </div>
    );
}
