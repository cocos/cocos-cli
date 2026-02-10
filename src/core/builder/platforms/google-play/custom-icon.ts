
import { existsSync } from 'fs-extra';
import { join } from 'path';

export const ICON_DPI_LIST: Record<string, number> = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
};

/**
 * 默认 CustomIconList，存放在 static 下的 icon 路径
 */
export interface ICustomIconDpi {
    fileName: string;
    dirName: string;
    dpi: number;
    path: string;
}

export interface ICustomIconInfo {
    type: string,
    display: string,
    list: ICustomIconDpi[]
}

function getCustomIconInfoImpl(projDir: string, type: 'default' | 'custom', outputName: string): ICustomIconInfo {
    let base = '';
    switch (type) {
        case 'default':
            base = join(__dirname, `../../../../../src/core/builder/platforms/google-play/static/icons`);
            break;
        case 'custom':
            base = join(projDir, 'settings/icons/' + outputName);
            break;
    }
    let display = '';
    const list: ICustomIconDpi[] = Object.keys(ICON_DPI_LIST).map((name: string) => {
        const dirName = name;
        const fileName = 'ic_launcher.png';
        const pa = join(base, dirName, fileName);
        if (name === 'mipmap-xxxhdpi') {
            display = `${pa}?timestamp=${Date.now()}`;
        }
        return {
            dirName,
            fileName,
            dpi: ICON_DPI_LIST[name],
            path: pa,
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

/**
 * 获取自定义icon的信息
 * @param basePath
 * @param type
 * @param outputName
 */
export function getCustomIconInfo(projDir: string, type: 'default' | 'custom', outputName: string): ICustomIconInfo {
    const info = getCustomIconInfoImpl(projDir, type, outputName);
    // 如何自定义的 ICON 没有，就用默认图片
    if (!hasCustomIcon(info)) {
        return getCustomIconInfoImpl(projDir, 'default', outputName);
    }
    return info;
}
