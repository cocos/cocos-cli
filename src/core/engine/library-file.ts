import { resolve, relative, isAbsolute } from 'path';
import { stat } from 'fs/promises';
import { getEngineSelection } from '../../global';
import { getEngineBackendAdapter } from './adapter';

/** Resolve exact files before consulting the selected engine's serialization transport. */
export async function resolveLibraryAssetFile(tail: string, directories: readonly string[]): Promise<string | undefined> {
    const candidates = directories.map(directory => {
        const root = resolve(directory);
        const file = resolve(root, tail);
        const rel = relative(root, file);
        return rel && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel) ? file : undefined;
    }).filter((file): file is string => !!file);
    for (const file of candidates) {
        try { if ((await stat(file)).isFile()) return file; }
        catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
    }
    const selection = getEngineSelection();
    if (!selection) return undefined;
    const adapter = getEngineBackendAdapter(selection);
    for (const file of candidates) {
        const serialized = adapter.resolveSerializedAssetFile?.(file);
        if (serialized) return serialized;
    }
    return undefined;
}
