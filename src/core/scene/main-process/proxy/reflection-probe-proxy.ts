import type {
    IPublicReflectionProbeService,
    IReflectionProbeBakeAllOptions,
    IReflectionProbeBakeAllResult,
    IReflectionProbeBakeOptions,
    IReflectionProbeBakeResult,
    IReflectionProbeClearOptions,
    IReflectionProbeClearResult,
} from '../../common';
import { Rpc } from '../rpc';

export const ReflectionProbeProxy: IPublicReflectionProbeService = {
    startBake(options) {
        return Rpc.getInstance().request('ReflectionProbe', 'startBake', [options]);
    },
    cancelBake(options) {
        return Rpc.getInstance().request('ReflectionProbe', 'cancelBake', [options]);
    },
    getTaskState(source) {
        return Rpc.getInstance().request('ReflectionProbe', 'getTaskState', [source]);
    },
    getSceneIdentity() {
        return Rpc.getInstance().request('ReflectionProbe', 'getSceneIdentity', []);
    },
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'bake', [options]);
    },
    bakeAll(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeBakeAllResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'bakeAll', [options]);
    },
    clearAll(options: IReflectionProbeClearOptions = {}): Promise<IReflectionProbeClearResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'clearAll', [options]);
    },
};
