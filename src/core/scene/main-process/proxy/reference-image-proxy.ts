import {
    IPublicReferenceImageService,
    IReferenceImageCommitOptions,
    IReferenceImagePathOptions,
    IReferenceImageState,
    IReferenceImageVisibilityOptions,
} from '../../common';
import { Rpc } from '../rpc';

/** Node facade for formal reference-image operations; preview remains scene-local. */
export const ReferenceImageProxy: IPublicReferenceImageService = {
    getState(): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'getState');
    },
    addAndSelect(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'addAndSelect', [options]);
    },
    remove(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'remove', [options]);
    },
    select(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'select', [options]);
    },
    setVisible(options: IReferenceImageVisibilityOptions): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'setVisible', [options]);
    },
    refresh(): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'refresh');
    },
    commitParameters(options: IReferenceImageCommitOptions): Promise<IReferenceImageState> {
        return Rpc.getInstance().request('ReferenceImage', 'commitParameters', [options]);
    },
};
