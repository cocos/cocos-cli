import type {
    IPublicReflectionProbeService,
    IReflectionProbeBakeAllOptions,
    IReflectionProbeBakeAllResult,
    IReflectionProbeBakeOptions,
    IReflectionProbeBakeResult,
} from '../../common';
import { Rpc } from '../rpc';

export const ReflectionProbeProxy: IPublicReflectionProbeService = {
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'bake', [options]);
    },
    bakeAll(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeBakeAllResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'bakeAll', [options]);
    },
};
