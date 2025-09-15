'use strict';

export let serialize: any;
export let serializeCompiled: any;
export let deserializeFull: any;

// MissingReporter
import { MissingClassReporter, MissingClass } from './missing-reporter/missing-class-reporter';
import { MissingObjectReporter } from './missing-reporter/missing-object-reporter';
export { walkProperties } from './missing-reporter/object-walker';

export const MissingReporter = {
    classInstance: MissingClass,
    class: MissingClassReporter,
    object: MissingObjectReporter,
};

export async function init() {
    const serializeUtils = await import('./utils/serialize');
    serialize = serializeUtils.serialize;
    serializeCompiled = serializeUtils.serializeCompiled;
    deserializeFull = await import('./utils/deserialize');
}

declare global {
    export const EditorExtends: typeof import('.');
    export namespace cce {
        export namespace Utils {
            export const serialize: typeof import('./utils/serialize/index')['serialize'];
        }
    }
}
