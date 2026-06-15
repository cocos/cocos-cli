'use strict';

import { CCObject, Component, DirectionalLight, Layers, LightComponent, Node } from 'cc';
import { BaseService } from './core';
import { register, Service } from './core/decorator';
import { lightManager } from './scene-view/light-manager';
import { sceneViewData } from './scene-view/scene-view-data';
import type { ISceneViewEvents, ISceneViewService } from '../../common';

@register('SceneView')
export class SceneViewService extends BaseService<ISceneViewEvents> implements ISceneViewService {
    private _sceneViewLight: LightComponent | null = null;
    private _lightNode: Node | null = null;
    private _isVisible = true;

    init(): void {
        const lightNode = new Node('SceneViewLight');
        lightNode.layer = Layers.Enum.EDITOR;
        lightNode._objFlags |= CCObject.Flags.DontSave;
        this._lightNode = lightNode;

        const light = lightNode.addComponent(DirectionalLight);
        this._sceneViewLight = light;
        light.enabled = !sceneViewData.isSceneLightOn;

        // Parent to editor camera node if available
        try {
            const cameraNode = (Service as any).Camera?.camera?.node;
            if (cameraNode) {
                lightNode.parent = cameraNode;
            }
        } catch (e) {
            // Camera not ready
        }

        sceneViewData.on('is-scene-light-on', (isOn: boolean) => {
            this._onIsSceneLightOn(isOn);
        });

        void this.initFromConfig().then(() => {
            this._onIsSceneLightOn(sceneViewData.isSceneLightOn);
        });
    }

    async initFromConfig(): Promise<void> {
        await sceneViewData.initFromConfig();
    }

    async saveConfig(): Promise<void> {
        await sceneViewData.saveConfig();
    }

    setSceneLightOn(enable: boolean): void {
        sceneViewData.isSceneLightOn = enable;
        void sceneViewData.saveConfig();
    }

    querySceneLightOn(): boolean {
        return sceneViewData.isSceneLightOn;
    }

    onEditorOpened(): void {
        const scene = (cc as any).director?.getScene();
        lightManager.onEditorOpened(scene, sceneViewData.isSceneLightOn);

        // Parent light node to scene if not already parented
        if (this._lightNode && !this._lightNode.parent) {
            try {
                const sceneNode = (cc as any).director?.getScene();
                if (sceneNode) {
                    this._lightNode.parent = sceneNode;
                }
            } catch (e) {
                // Scene not ready
            }
        }
    }

    onEditorClosed(): void {
        // Nothing to clean up
    }

    onComponentAdded(comp: Component): void {
        lightManager.onComponentAdded(comp);
    }

    onComponentRemoved(comp: Component): void {
        lightManager.onComponentRemoved(comp);
    }

    get isVisible(): boolean {
        return this._isVisible;
    }

    set isVisible(value: boolean) {
        this._isVisible = value;
        this.emit('scene-view:visibility-changed', value);
    }

    private _onIsSceneLightOn(isEnable: boolean): void {
        if (isEnable) {
            lightManager.enableSceneLights();
            if (this._sceneViewLight) {
                this._sceneViewLight.enabled = false;
            }
        } else {
            lightManager.disableSceneLights();
            if (this._sceneViewLight) {
                this._sceneViewLight.enabled = true;
            }
        }
        this.emit('scene-view:light-changed', isEnable);

        try {
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine not ready
        }
    }
}
