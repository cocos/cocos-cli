import type {
    IPublicReflectionProbeService,
    IReflectionProbeBakeOptions,
    IReflectionProbeBakeResult,
} from '../../common';
import { Rpc } from '../rpc';

export const ReflectionProbeProxy: IPublicReflectionProbeService = {
    bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult> {
        return Rpc.getInstance().request('ReflectionProbe', 'bake', [options]);
    },
};
