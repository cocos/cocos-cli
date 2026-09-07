/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MotionPreviewDesc, IMotionPreviewService } from '../../common/preview';
import { Rpc } from '../rpc';

/**
 * 场景进程 PreviewService 的主进程 RPC 代理。
 */
export const PreviewProxy: IMotionPreviewService = {
    async showMotion(desc: MotionPreviewDesc): Promise<boolean> {
        const result = await Rpc.getInstance().request('Preview', 'showMotion', [desc]);
        return result === true;
    },

    hideMotion(): Promise<void> {
        return Rpc.getInstance().request('Preview', 'hideMotion', []);
    },

    setMotionModel(uuid: string): Promise<void> {
        return Rpc.getInstance().request('Preview', 'setMotionModel', [uuid]);
    },

    setMotionTime(time: number): Promise<void> {
        return Rpc.getInstance().request('Preview', 'setMotionTime', [time]);
    },

    playMotion(): Promise<void> {
        return Rpc.getInstance().request('Preview', 'playMotion', []);
    },

    pauseMotion(): Promise<void> {
        return Rpc.getInstance().request('Preview', 'pauseMotion', []);
    },

    stopMotion(): Promise<void> {
        return Rpc.getInstance().request('Preview', 'stopMotion', []);
    },

    setMotionVariable(name: string, value: number): Promise<void> {
        return Rpc.getInstance().request('Preview', 'setMotionVariable', [name, value]);
    },

    setMotionParameter(axis: 'value' | 'x' | 'y', value: number): Promise<void> {
        return Rpc.getInstance().request('Preview', 'setMotionParameter', [axis, value]);
    },

    getMotionTimelineStats(): Promise<{ timeLineLength: number } | null> {
        return Rpc.getInstance().request('Preview', 'getMotionTimelineStats', []);
    },

    async isMotionActive(): Promise<boolean> {
        const result = await Rpc.getInstance().request('Preview', 'isMotionActive', []);
        return result === true;
    },

    queryMotionImage(info: { width: number; height: number }): Promise<unknown> {
        return Rpc.getInstance().request('Preview', 'queryMotionImage', [info]);
    },

    onMotionMouseDown(action: { x: number; y: number; button: number }): Promise<void> {
        return Rpc.getInstance().request('Preview', 'onMotionMouseDown', [action]);
    },

    onMotionMouseMove(action: { movementX: number; movementY: number }): Promise<void> {
        return Rpc.getInstance().request('Preview', 'onMotionMouseMove', [action]);
    },

    onMotionMouseUp(action: { x: number; y: number }): Promise<void> {
        return Rpc.getInstance().request('Preview', 'onMotionMouseUp', [action]);
    },

    onMotionMouseWheel(action: { wheelDeltaY: number; wheelDeltaX: number }): Promise<void> {
        return Rpc.getInstance().request('Preview', 'onMotionMouseWheel', [action]);
    },
};
