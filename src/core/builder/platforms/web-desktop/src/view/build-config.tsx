import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
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

interface OpenPaasGameItem {
    id: string;
    label: string;
    name?: string;
    codeVersion?: string;
}

type UploadEnv = 'dev' | 'fat' | 'prod';

interface OpenPaasGameListResult {
    games: OpenPaasGameItem[];
    accessToken?: string;
    uploadEnv?: UploadEnv;
}

interface OpenPaasPackageContext {
    accessToken?: string;
    uploadEnv?: UploadEnv;
    codeVersion?: string;
}

interface OpenPaasWebPackageBridgeResult {
    bridgeLink?: string;
    accessToken?: string;
    uploadEnv?: UploadEnv;
}

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
const SELECT: CSSProperties = {
    ...INPUT,
    padding: '0 6px',
};
const ACTION_ROW: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 8,
    alignItems: 'center',
};
const BUTTON: CSSProperties = {
    height: 26,
    padding: '0 10px',
    border: '1px solid var(--vscode-button-border, transparent)',
    color: 'var(--vscode-button-foreground)',
    background: 'var(--vscode-button-background)',
    cursor: 'pointer',
};
const INFO: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-descriptionForeground)',
};
const ERROR: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-errorForeground, #f14c4c)',
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

export default function WebDesktopBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [games, setGames] = useState<OpenPaasGameItem[]>([]);
    const [loadingGames, setLoadingGames] = useState(false);
    const [loadingContext, setLoadingContext] = useState(false);
    const [serviceError, setServiceError] = useState('');
    const [contextReady, setContextReady] = useState(false);
    const syncedAppIdRef = useRef('');

    const t = (key: string) => translate(bundle, key);
    const set = (key: string, next: unknown) => onChange([key], next);
    const currentAppId = stringValue(value.appid);
    const isOpenPaasHostPlatform = stringValue(commonValue?.platform) === 'openpaas';

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
        if (!bridge) {
            return;
        }

        let cancelled = false;
        bridge.invoke<OpenPaasWebPackageBridgeResult>('getOpenPaasWebPackageBridge')
            .then((payload) => {
                if (cancelled) {
                    return;
                }
                if (payload.bridgeLink !== undefined) {
                    set('bridgeLink', payload.bridgeLink);
                }
                if (payload.accessToken !== undefined) {
                    set('accessToken', payload.accessToken);
                }
                if (payload.uploadEnv) {
                    set('uploadEnv', payload.uploadEnv);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setServiceError(error instanceof Error ? error.message : String(error));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [bridge]);

    const loadGames = useCallback(async () => {
        if (!bridge || isOpenPaasHostPlatform) {
            return;
        }
        setLoadingGames(true);
        setServiceError('');
        try {
            const result = await bridge.invoke<OpenPaasGameListResult | OpenPaasGameItem[]>('getOpenPaasGameList');
            const nextGames = Array.isArray(result) ? result : result.games;
            const accessToken = Array.isArray(result) ? undefined : result.accessToken;
            const uploadEnv = Array.isArray(result) ? undefined : result.uploadEnv;
            setGames(Array.isArray(nextGames) ? nextGames : []);
            if (accessToken !== undefined) {
                set('accessToken', accessToken);
            }
            if (uploadEnv) {
                set('uploadEnv', uploadEnv);
            }
        } catch (error) {
            setGames([]);
            setServiceError(error instanceof Error ? error.message : String(error));
        } finally {
            setLoadingGames(false);
        }
    }, [bridge, isOpenPaasHostPlatform]);

    useEffect(() => {
        void loadGames();
    }, [loadGames]);

    const fetchPackageContext = async (gameId = currentAppId) => {
        if (!bridge || !gameId || isOpenPaasHostPlatform) {
            return;
        }
        setLoadingContext(true);
        setServiceError('');
        setContextReady(false);
        try {
            const payload = await bridge.invoke<OpenPaasPackageContext>('getOpenPaasPackageContext', gameId);
            set('accessToken', payload.accessToken || '');
            if (payload.uploadEnv) {
                set('uploadEnv', payload.uploadEnv);
            }
            set('codeVersion', payload.codeVersion || stringValue(value.codeVersion));
            setContextReady(true);
        } catch (error) {
            setServiceError(error instanceof Error ? error.message : String(error));
        } finally {
            setLoadingContext(false);
        }
    };

    useEffect(() => {
        if (!bridge || !currentAppId || isOpenPaasHostPlatform) {
            syncedAppIdRef.current = '';
            return;
        }
        if (syncedAppIdRef.current === currentAppId) {
            return;
        }
        syncedAppIdRef.current = currentAppId;
        void fetchPackageContext(currentAppId);
    }, [bridge, currentAppId, isOpenPaasHostPlatform]);

    const applyGame = (gameId: string) => {
        syncedAppIdRef.current = gameId;
        setContextReady(false);
        set('appid', gameId);
        set('accessToken', '');
        const game = games.find((item) => item.id === gameId);
        set('codeVersion', game?.codeVersion || '');
        if (gameId) {
            void fetchPackageContext(gameId);
        }
    };

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            {!isOpenPaasHostPlatform && (
                <div style={ROW}>
                    <TypedField label={t('service.game')} tooltip={t('service.game_hint')}>
                        <div style={ACTION_ROW}>
                            <select
                                style={SELECT}
                                value={currentAppId}
                                disabled={loadingGames}
                                onChange={(event: ChangeEvent<HTMLSelectElement>) => applyGame(event.target.value)}
                            >
                                <option value="">{loadingGames ? t('service.loading_games') : t('service.game_placeholder')}</option>
                                {games.map((game) => (
                                    <option key={game.id} value={game.id}>{game.label}</option>
                                ))}
                            </select>
                            <button style={BUTTON} type="button" disabled={loadingGames} onClick={() => void loadGames()}>
                                {t('service.refresh_games')}
                            </button>
                        </div>
                        {!loadingGames && games.length === 0 && <div style={INFO}>{t('service.no_games')}</div>}
                    </TypedField>
                    <div style={INFO}>
                        {loadingContext
                            ? t('service.loading_context')
                            : contextReady
                                ? t('service.context_ready')
                                : stringValue(value.codeVersion)
                                    ? t('service.code_version').replace('{codeVersion}', stringValue(value.codeVersion))
                                    : ''}
                    </div>
                    {serviceError && <div style={ERROR}>{serviceError}</div>}
                </div>
            )}
        </div>
    );
}
