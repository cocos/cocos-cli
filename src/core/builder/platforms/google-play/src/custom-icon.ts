import { ensureDir, existsSync, remove } from 'fs-extra';
import { dirname, join } from 'path';

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

function defaultIconRoot(): string {
    return join(__dirname, '../../static/icons');
}

function getCustomIconRoot(projectRoot: string, outputName: string): string {
    return join(projectRoot, 'settings/icons', outputName);
}

function getIconRoot(projectRoot: string, type: 'default' | 'custom', outputName: string): string {
    return type === 'custom'
        ? getCustomIconRoot(projectRoot, outputName)
        : defaultIconRoot();
}

function getIconPath(base: string, dirName: string): string {
    return join(base, dirName, 'ic_launcher.png');
}

function hasIconRoot(base: string): boolean {
    return existsSync(getIconPath(base, 'mipmap-mdpi'));
}

function resolveIconRoot(projectRoot: string, type: 'default' | 'custom', outputName: string): { type: 'default' | 'custom'; base: string } {
    const base = getIconRoot(projectRoot, type, outputName);
    if (type === 'default' || hasIconRoot(base)) {
        return { type, base };
    }
    return { type: 'default', base: defaultIconRoot() };
}

function getCustomIconInfoImpl(type: 'default' | 'custom', base: string): ICustomIconInfo {
    let display = '';
    const list = Object.entries(ICON_DPI_LIST).map(([dirName, dpi]) => {
        const fileName = 'ic_launcher.png';
        const path = getIconPath(base, dirName);
        if (dirName === 'mipmap-xxxhdpi') {
            display = `${path}?timestamp=${Date.now()}`;
        }
        console.log('getCustomIconInfoImpl', path,'dirName',dirName,'fileName',fileName,'base',base);
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

export function getDisplayCustomIcon(projectRoot: string, type: 'default' | 'custom', outputName: string): string {
    const { base } = resolveIconRoot(projectRoot, type, outputName);
    return `${getIconPath(base, 'mipmap-xxxhdpi')}?timestamp=${Date.now()}`;
}

export async function saveCustomIcon(source: string, projectRoot: string, type: 'default' | 'custom', outputName: string): Promise<string> {
    const sharp = require('sharp') as (input: string) => {
        resize(width: number, height: number, options?: Record<string, unknown>): {
            withMetadata(metadata: Record<string, unknown>): { toFile(file: string): Promise<unknown> };
        };
    };
    const info = getCustomIconInfoImpl(type, getIconRoot(projectRoot, type, outputName));

    for (const item of info.list) {
        await ensureDir(dirname(item.path));
        await sharp(source)
            .resize(item.dpi, item.dpi, { fit: 'inside' })
            .withMetadata({ density: item.dpi })
            .toFile(item.path);
    }

    return info.display;
}

export function getCustomIconInfo(projectRoot: string, type: 'default' | 'custom', outputName: string): ICustomIconInfo {
    console.log('getCustomIconInfo', projectRoot, type, outputName);
    const resolved = resolveIconRoot(projectRoot, type, outputName);
    return getCustomIconInfoImpl(resolved.type, resolved.base);
}

export async function removeCustomIcon(projectRoot: string, type: 'default' | 'custom', outputName: string): Promise<void> {
    if (type === 'default') {
        return;
    }
    try {
        await remove(getCustomIconRoot(projectRoot, outputName));
    } catch {
        // Keep the editor behavior: deleting generated icons must not block task cleanup.
    }
}
