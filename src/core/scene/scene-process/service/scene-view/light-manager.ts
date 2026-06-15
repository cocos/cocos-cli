'use strict';

import { Component, LightComponent } from 'cc';
import { sceneViewData } from './scene-view-data';

function isEditorNode(node: any): boolean {
    if (!node) return false;
    const { Layers } = require('cc');
    if (node.layer & Layers.Enum.GIZMOS) return true;
    if (node.layer & Layers.Enum.SCENE_GIZMO) return true;
    if (node.layer & Layers.Enum.EDITOR) return true;
    return false;
}

class LightManager {
    private _lights: LightComponent[] = [];

    onEditorOpened(scene: any, isSceneLightOn: boolean): void {
        this._lights.length = 0;
        if (!scene) return;

        const walk = (node: any) => {
            if (!node) return;
            if (isEditorNode(node)) return;
            const components = node.components;
            if (components) {
                for (let i = 0; i < components.length; i++) {
                    const comp = components[i];
                    if (comp instanceof LightComponent) {
                        this.overrideLightCompFunc(comp);
                        this._lights.push(comp);
                    }
                }
            }
            const children = node.children;
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    walk(children[i]);
                }
            }
        };

        walk(scene);

        if (isSceneLightOn) {
            this.enableSceneLights();
        } else {
            this.disableSceneLights();
        }
    }

    onComponentAdded(comp: Component): void {
        if (comp instanceof LightComponent && !isEditorNode(comp.node)) {
            this.overrideLightCompFunc(comp);
            this._lights.push(comp);
        }
    }

    onComponentRemoved(comp: Component): void {
        if (comp instanceof LightComponent) {
            const idx = this._lights.indexOf(comp);
            if (idx >= 0) {
                this._lights.splice(idx, 1);
            }
        }
    }

    disableSceneLights(): void {
        for (const light of this._lights) {
            try {
                if (light.onDisable) {
                    light.onDisable();
                }
            } catch (e) {
                // Light may be in invalid state
            }
        }
    }

    enableSceneLights(): void {
        for (const light of this._lights) {
            try {
                if (light.enabled && light.node?.activeInHierarchy && light.onEnable) {
                    light.onEnable();
                }
            } catch (e) {
                // Light may be in invalid state
            }
        }
    }

    overrideLightCompFunc(comp: LightComponent): void {
        if ((comp as any)._hasOverrideOnEnable) return;
        (comp as any)._hasOverrideOnEnable = true;
        const originalOnEnable = comp.onEnable?.bind(comp);
        if (originalOnEnable) {
            comp.onEnable = () => {
                if (sceneViewData.isSceneLightOn) {
                    originalOnEnable();
                }
            };
        }
    }
}

export const lightManager = new LightManager();
