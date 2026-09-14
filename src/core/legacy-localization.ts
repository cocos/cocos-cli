import { dirname, join, resolve } from 'path';

/** PinK replaces only the Creator project L10n implementation, without touching its files. */
export function isLegacyProjectLocalization(projectRoot: string, extensionDir: string, manifest: { name?: unknown } | null | undefined): boolean {
    return manifest?.name === 'localization-editor'
        && resolve(dirname(extensionDir)) === resolve(join(projectRoot, 'extensions'));
}
