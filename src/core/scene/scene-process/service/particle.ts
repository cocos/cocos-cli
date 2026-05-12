'use strict';

import { Component, Node } from 'cc';
import { BaseService, register } from './core';

function getNodeByPath(path: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNodeByPath?.(path) ?? null;
}

function getNodeByUuid(uuid: string): Node | null {
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    return EditorExtends?.Node?.getNode?.(uuid) ?? null;
}

// 与 cocos-editor ParticleManager 一致：只处理 3D ParticleSystem
function isParticleSystem(comp: Component): boolean {
    return cc.js.getClassName(comp) === 'cc.ParticleSystem';
}

function getParticleSystemsInChildren(node: Node): Component[] {
    const result: Component[] = [];
    const components = node.components;
    if (components) {
        for (const comp of components) {
            if (isParticleSystem(comp)) {
                result.push(comp);
            }
        }
    }
    const children = node.children;
    if (children) {
        for (const child of children) {
            result.push(...getParticleSystemsInChildren(child));
        }
    }
    return result;
}

// 与 cocos-editor ParticleManager 一致：管理粒子系统在编辑模式下的播放
@register('Particle')
export class ParticleService extends BaseService<Record<string, never>> {
    private _selectedUUIDs: string[] = [];
    private _stoppedSet = new WeakSet<Component>();

    // 与 cocos-editor ParticleManager.getSelectedParticleSystemComponents 一致：
    // 递归查找父节点直到找到非粒子组件的节点，然后收集所有子粒子组件
    private _getSelectedParticleSystemComponents(): Component[] {
        const result: Component[] = [];

        function addUnique(comps: Component[]) {
            for (const comp of comps) {
                if (!result.includes(comp)) {
                    result.push(comp);
                }
            }
        }

        function recursivelyAdd(node: Node) {
            const hasParticle = node.components?.some((c: Component) => isParticleSystem(c));
            if (hasParticle) {
                const parent = node.parent;
                if (parent && parent.components?.some((c: Component) => isParticleSystem(c))) {
                    recursivelyAdd(parent);
                } else {
                    addUnique(getParticleSystemsInChildren(node));
                }
            }
        }

        for (const uuid of this._selectedUUIDs) {
            const node = getNodeByUuid(uuid);
            if (node) {
                recursivelyAdd(node);
            }
        }

        return result.filter((comp: any) => comp.enabled);
    }

    onSelectionSelect(path: string, paths: string[]) {
        this._selectedUUIDs = paths.map(p => getNodeByPath(p)?.uuid).filter(Boolean) as string[];
        const components = this._getSelectedParticleSystemComponents();
        const willPlay = components.some(item => !this._stoppedSet.has(item));
        if (willPlay) {
            components.forEach(item => this._stoppedSet.delete(item));
        }
        components.forEach((ps: any) => {
            if (!ps.isPlaying && !this._stoppedSet.has(ps)) {
                ps.play();
            }
        });
    }

    onSelectionUnselect(path: string, paths: string[]) {
        const remainingUuids = paths.map(p => getNodeByPath(p)?.uuid).filter(Boolean) as string[];
        this._getSelectedParticleSystemComponents().forEach((ps: any) => {
            if (!remainingUuids.includes(ps.node.uuid) && ps.isPlaying) {
                ps.pause();
            }
        });
        this._selectedUUIDs = remainingUuids;
    }

    onSelectionClear() {
        this._getSelectedParticleSystemComponents().forEach((ps: any) => {
            if (ps.isPlaying) {
                ps.stop();
            }
        });
        this._selectedUUIDs = [];
    }

    onComponentAdded(comp: Component) {
        if (isParticleSystem(comp) && this._getSelectedParticleSystemComponents().includes(comp)) {
            if (!(comp as any).isPlaying) {
                (comp as any).play();
            }
        }
    }

    onSceneClosed() {
        this._selectedUUIDs = [];
    }
}
