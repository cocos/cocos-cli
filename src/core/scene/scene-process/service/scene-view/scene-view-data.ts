'use strict';

import { EventEmitter } from 'events';
import { Rpc } from '../../rpc';

export interface IResolutionData {
    width: number;
    height: number;
}

class SceneViewData extends EventEmitter {
    private _targetResolution: IResolutionData = { width: 960, height: 640 };
    private _targetAspect: number = 960 / 640;
    private _isSceneLightOn = true;

    get targetResolution(): IResolutionData {
        return this._targetResolution;
    }

    set targetResolution(value: IResolutionData) {
        this._targetResolution = value;
        this._targetAspect = value.width / value.height;
        this.emit('target-resolution-changed', value);
    }

    get targetAspect(): number {
        return this._targetAspect;
    }

    get targetWidth(): number {
        return this._targetResolution.width;
    }

    get targetHeight(): number {
        return this._targetResolution.height;
    }

    get isSceneLightOn(): boolean {
        return this._isSceneLightOn;
    }

    set isSceneLightOn(value: boolean) {
        this._isSceneLightOn = value;
        this.emit('is-scene-light-on', value);
    }

    async initFromConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            const config = await rpc.request('sceneConfigInstance', 'get', ['sceneView']) as { sceneLightOn?: boolean } | undefined;
            if (typeof config?.sceneLightOn === 'boolean') {
                this._isSceneLightOn = config.sceneLightOn;
            }
        } catch {
            // Config persistence not available
        }
    }

    async saveConfig(): Promise<void> {
        try {
            const rpc = Rpc.getInstance();
            await rpc.request('sceneConfigInstance', 'set', ['sceneView', {
                sceneLightOn: this._isSceneLightOn,
            }]);
        } catch {
            // Config persistence not available
        }
    }
}

export const sceneViewData = new SceneViewData();
