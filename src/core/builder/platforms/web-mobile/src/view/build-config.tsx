import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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

interface PreviewInfo {
    previewUrl: string;
    qrcodeSrc: string;
    webGPUTips: string;
    webGPULink: string;
}

const ROW: CSSProperties = { padding: '2px 16px 6px 0px' };
const STACK: CSSProperties = { display: 'grid', gap: 8 };
const INLINE: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const INFO: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-descriptionForeground)',
};
const WARN: CSSProperties = {
    paddingTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--vscode-editorWarning-foreground, var(--vscode-descriptionForeground))',
};
const LINK: CSSProperties = {
    color: 'var(--vscode-textLink-foreground)',
    textDecoration: 'none',
    wordBreak: 'break-all',
};
const QR_CODE: CSSProperties = {
    width: 180,
    height: 180,
    objectFit: 'contain',
    border: '1px solid var(--vscode-panel-border, rgba(127,127,127,.35))',
    background: '#fff',
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

function boolValue(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

export default function WebMobileBuildView({ value, onChange, bridge, commonValue }: PlatformBuildViewProps) {
    const [bundle, setBundle] = useState<Record<string, unknown>>({});
    const [previewInfo, setPreviewInfo] = useState<PreviewInfo>({
        previewUrl: '',
        qrcodeSrc: '',
        webGPUTips: '',
        webGPULink: '',
    });
    const [loadingPreview, setLoadingPreview] = useState(false);
    const useWebGPU = boolValue(value.useWebGPU);
    const outputName = stringValue(commonValue?.outputName) || 'web-mobile';
    const buildPath = stringValue(commonValue?.buildPath) || 'project://build';
    const t = (key: string) => translate(bundle, key);
    const previewRequest = useMemo(() => ({ buildPath, outputName, useWebGPU }), [buildPath, outputName, useWebGPU]);

    const openPreviewUrl = (url: string) => {
        bridge?.invoke('openPreviewUrl', url).catch(() => {});
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
        if (!bridge) {
            return;
        }

        let cancelled = false;
        setLoadingPreview(true);
        bridge.invoke<PreviewInfo>('getPreviewInfo', previewRequest)
            .then((info) => {
                if (!cancelled) {
                    setPreviewInfo(info ?? {
                        previewUrl: '',
                        qrcodeSrc: '',
                        webGPUTips: '',
                        webGPULink: '',
                    });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPreviewInfo({
                        previewUrl: '',
                        qrcodeSrc: '',
                        webGPUTips: '',
                        webGPULink: '',
                    });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingPreview(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [bridge, previewRequest]);

    return (
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={ROW}>
                <TypedField label="WEBGPU" tooltip={t('tips.webgpu')}>
                    <Checkbox checked={useWebGPU} onCheckedChange={(checked: boolean) => onChange(['useWebGPU'], !!checked)} />
                </TypedField>
            </div>

            <div style={ROW}>
                <TypedField label={t('options.preview_qrcode')}>
                    <div style={STACK}>
                        {previewInfo.webGPUTips ? (
                            <div style={WARN}>
                                {previewInfo.webGPUTips}{' '}
                                {previewInfo.webGPULink && (
                                    <a href={previewInfo.webGPULink} style={LINK}>
                                        {previewInfo.webGPULink}
                                    </a>
                                )}
                            </div>
                        ) : previewInfo.qrcodeSrc ? (
                            <img alt="" src={previewInfo.qrcodeSrc} style={QR_CODE} />
                        ) : (
                            <div style={INFO}>{loadingPreview ? 'Loading...' : 'Preview server is not available. Please build first.'}</div>
                        )}
                    </div>
                </TypedField>
            </div>

            <div style={ROW}>
                <TypedField label={t('options.preview_url')}>
                    <div style={INLINE}>
                        {previewInfo.previewUrl ? (
                            <a
                                href={previewInfo.previewUrl}
                                style={LINK}
                                onClick={(event: { preventDefault(): void }) => {
                                    event.preventDefault();
                                    openPreviewUrl(previewInfo.previewUrl);
                                }}
                            >
                                {previewInfo.previewUrl}
                            </a>
                        ) : (
                            <span style={INFO}>{loadingPreview ? 'Loading...' : 'Preview server is not available. Please build first.'}</span>
                        )}
                    </div>
                </TypedField>
            </div>
        </div>
    );
}
