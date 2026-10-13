import type { IPrefabWriteHost } from '../../../common/prefab-write';
import { Rpc } from '../../rpc';
import { queryRegisteredService } from '../core/decorator';
import { PrefabWriteRuntime } from './write-runtime';

const host: IPrefabWriteHost = {
    registerRuntime: options => Rpc.getInstance().request('prefabWriteHost', 'registerRuntime', [options]),
    queryRuntime: registration => Rpc.getInstance().request('prefabWriteHost', 'queryRuntime', [registration]),
    beginEdit: options => Rpc.getInstance().request('prefabWriteHost', 'beginEdit', [options]),
    finishEdit: options => Rpc.getInstance().request('prefabWriteHost', 'finishEdit', [options]),
    markRuntimeUnavailable: registration =>
        Rpc.getInstance().request('prefabWriteHost', 'markRuntimeUnavailable', [registration]),
    unregisterRuntime: registration =>
        Rpc.getInstance().request('prefabWriteHost', 'unregisterRuntime', [registration]),
    readSource: uuid => Rpc.getInstance().request('prefabWriteHost', 'readSource', [uuid]),
    commit: options => Rpc.getInstance().request('prefabWriteHost', 'commit', [options]),
};

export const prefabWriteSession = new PrefabWriteRuntime(
    host,
    () => queryRegisteredService<{ isDirty(): boolean }>('Undo')?.isDirty() ?? false,
);

/** Mutations without Editor.lock still participate in the same runtime occupancy. */
export function prefabEdit<TArgs extends unknown[], TResult>(
    _target: object,
    _key: string,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<TResult>>,
): void {
    const method = descriptor.value!;
    descriptor.value = function (...args: TArgs) {
        return prefabWriteSession.edit(() => method.apply(this, args));
    };
}
