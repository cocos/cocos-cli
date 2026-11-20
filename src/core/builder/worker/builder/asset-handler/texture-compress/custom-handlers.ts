import type { ICompressConfig } from '../../../../@types';
import type { IBuildAssetHandlerInfo } from '../../../../@types/private';

/** Processors remove completed tasks; the remaining queue goes to the default compressor. */
export async function runCustomTextureHandlers(queue: ICompressConfig[], infos: IBuildAssetHandlerInfo): Promise<void> {
    if (!queue.length) { return; }
    for (const pkgName of infos.pkgNameOrder) {
        const handler = infos.handles[pkgName];
        if (!handler) { continue; }
        try {
            console.debug(`Start custom compress(${pkgName})`);
            await handler(queue);
        } catch (error) {
            console.error(error);
            console.error(`Custom Compress (${pkgName}) failed!`);
            if (infos.required?.includes(pkgName)) { throw error; }
        }
    }
}
