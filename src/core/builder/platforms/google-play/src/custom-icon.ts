import { existsSync } from 'fs-extra';
import { join } from 'path';

export const ICON_DPI_LIST: Record<string, number> = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
};

export interface ICustomIconDpi {
    fileName: string;
    dirName: string;
    dpi: number;
    path: string;
}

export interface ICustomIconInfo {
    type: string;
    display: string;
    list: ICustomIconDpi[];
}

function getCustomIconInfoImpl(projDir: string, type: 'default' | 'custom', outputName: string): ICustomIconInfo {
    const base = type === 'custom'
        ? join(projDir, 'settings/icons', outputName)
        : join(__dirname, '../../../../../../static/assets/google-play/icons');

    let display = '';
    const list = Object.entries(ICON_DPI_LIST).map(([dirName, dpi]) => {
        const fileName = 'ic_launcher.png';
        const path = join(base, dirName, fileName);
        if (dirName === 'mipmap-xxxhdpi') {
            display = `${path}?timestamp=${Date.now()}`;
        }
        return {
            dirName,
            fileName,
            dpi,
            path,
        };
    });

    return {
        type,
        display,
        list,
    };
}

function hasCustomIcon(info: ICustomIconInfo): boolean {
    return existsSync(info.list[0].path);
}

export function getCustomIconInfo(projDir: string, type: 'default' | 'custom', outputName: string): ICustomIconInfo {
    const info = getCustomIconInfoImpl(projDir, type, outputName);
    if (!hasCustomIcon(info)) {
        return getCustomIconInfoImpl(projDir, 'default', outputName);
    }
    return info;
}
