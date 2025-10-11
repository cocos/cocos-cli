'use strict';

export let serialize: any;
export let serializeCompiled: any;
export let deserializeFull: any;

// MissingReporter
import { MissingClassReporter, MissingClass } from './missing-reporter/missing-class-reporter';
import { MissingObjectReporter } from './missing-reporter/missing-object-reporter';
export { walkProperties } from './missing-reporter/object-walker';

import utils from '../../base/utils';
import EventEmitter from 'events';
import ScriptManager from './manager/script';
import NodeManager from './manager/node';
import ComponentManager from './manager/component';

export const UuidUtils = utils.UUID;

export const Script = new ScriptManager();
export const Node = new NodeManager();
export const Component = new ComponentManager();

export * as GeometryUtils from './utils/geometry';
export * as PrefabUtils from './utils/prefab';

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

const event = new EventEmitter();

export function emit(name: string | symbol, ...args: string[]) {
    event.emit(name, ...args);
}

export function on(name: string | symbol, handle: (...args: any[]) => void) {
    event.on(name, handle);
}

export function removeListener(name: string | symbol, handle: (...args: any[]) => void) {
    event.removeListener(name, handle);
}

declare global {
    export const EditorExtends: typeof import('.');
    export namespace cce {
        export namespace Utils {
            export const serialize: typeof import('./utils/serialize/index')['serialize'];
        }
    }
}
