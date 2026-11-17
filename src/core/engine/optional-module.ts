/** Read an optional editor module without hiding failures inside available modules. */
export function optionalEngineModule<T>(id: string, load: () => T): T | undefined {
    try { return load(); }
    catch (error) {
        const message = typeof (error as Error)?.message === 'string' ? (error as Error).message : String(error);
        if (message.startsWith('Can not load engine module: ' + id + '.') ||
            ((error as NodeJS.ErrnoException)?.code === 'MODULE_NOT_FOUND' && (message.startsWith("Cannot find module '" + id + "'") || message.startsWith('Cannot find module "' + id + '"')))) return undefined;
        throw error;
    }
}
export function unavailableEngineFeature(feature: string): Error {
    return Object.assign(new Error('The selected engine does not support ' + feature), { code: 'ENGINE_CAPABILITY_UNAVAILABLE' });
}
