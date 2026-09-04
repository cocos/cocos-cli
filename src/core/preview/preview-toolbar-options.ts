/**
 * 浏览器预览工具栏的会话状态。
 *
 * Creator 通过预览页 socket 的 `changeOption` 事件保存这些选项，并在刷新后的
 * HTML 中再次注入。这里保持同样的「CLI 进程内预览会话」范围：不写入工程配置，
 * 不影响没有启用 previewToolbar 的普通预览。
 */
export type PreviewToolbarOptionName = 'device' | 'rotate' | 'debugMode' | 'showFps';

export interface PreviewToolbarOptions {
    device: string;
    rotate: boolean;
    debugMode: string;
    showFps: boolean;
}

const defaultOptions: Readonly<PreviewToolbarOptions> = {
    device: 'design',
    rotate: false,
    debugMode: 'WARN',
    showFps: true,
};

const deviceIds = new Set([
    'design',
    'webpage-fullscreen',
    'iphone-14-pro',
    'iphone-14-plus',
    'iphone-14',
    'iphone-x',
    'iphone-xr',
    'ipad-10-2',
    'ipad-air',
    'ipad-pro',
    'oppo-reno-2',
    'huawei-nova-5',
    'honor-x8',
    'huawei-nova-8i',
    'huawei-mate-40-pro',
    'huawei-mate-30-pro',
    'xiaomi-redmi-8',
    'sony-xperia-5',
    'oppo-a77',
    'nokia-c2',
    'asus-rog-phone-6',
    'lenovo-legion-2-pro',
]);

const debugModes = new Set([
    'NONE',
    'VERBOSE',
    'INFO',
    'WARN',
    'ERROR',
    'INFO_FOR_WEB_PAGE',
    'WARN_FOR_WEB_PAGE',
    'ERROR_FOR_WEB_PAGE',
]);

let options: PreviewToolbarOptions = { ...defaultOptions };

export function getPreviewToolbarOptions(): PreviewToolbarOptions {
    return { ...options };
}

export function setPreviewToolbarOption(name: unknown, value: unknown): boolean {
    switch (name) {
    case 'device':
        if (typeof value === 'string' && deviceIds.has(value)) {
            options.device = value;
            return true;
        }
        return false;
    case 'rotate':
        if (typeof value === 'boolean') {
            options.rotate = value;
            return true;
        }
        return false;
    case 'debugMode':
        if (typeof value === 'string' && debugModes.has(value)) {
            options.debugMode = value;
            return true;
        }
        return false;
    case 'showFps':
        if (typeof value === 'boolean') {
            options.showFps = value;
            return true;
        }
        return false;
    default:
        return false;
    }
}

/** @internal Test-only reset for this process-scoped preview session state. */
export function resetPreviewToolbarOptions(): void {
    options = { ...defaultOptions };
}
