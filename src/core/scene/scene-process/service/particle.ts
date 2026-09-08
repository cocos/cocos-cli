'use strict';

import { Component, Node } from 'cc';
import { BaseService, register } from './core';
import { IParticleService } from '../../common';

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
export class ParticleService extends BaseService<Record<string, never>> implements IParticleService {
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

    onEditorDisposed() {
        this._selectedUUIDs = [];
    }

    /**
     * 请求粒子系统运行时的数据，与 cocos-editor ParticleManager.queryPlayInfo 一致。
     * @param uuid 粒子组件的 uuid
     */
    public queryPlayInfo(uuid: string) {
        const comp = this._findComponentByUuid(uuid);
        if (!comp) {
            return null;
        }
        const ps: any = comp;
        return {
            speed: ps.simulationSpeed,
            time: Number(ps.time?.toFixed?.(2) ?? 0),
            particle: ps.getParticleCount?.() ?? 0,
            isPlaying: !!ps.isPlaying,
        };
    }

    /**
     * 设置粒子的运行速度，与 cocos-editor ParticleManager.setPlaySpeed 一致。
     * @param uuid 组件的 uuid
     * @param speed 粒子组件的运行速度
     */
    public setPlaySpeed(uuid: string, speed: number) {
        const comp = this._findComponentByUuid(uuid);
        if (!comp) {
            return;
        }
        const ps: any = comp;
        ps.simulationSpeed = speed;

        const node = ps.node;
        const index = node['_components']?.indexOf(ps);
        if (index === -1 || index === undefined) {
            return;
        }
        const propPath = `__comps__.${index}.simulationSpeed`;
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        EditorExtends?.Node?.emit?.('change', node, { propPath });
    }

    /**
     * 这个播放的行为会将递归找当前选中节点的父节点，直到找到非包含粒子组件的节点为止，将找到的父节点一起播放。
     * 与 cocos-editor ParticleManager.play 一致。
     */
    public play() {
        this._getSelectedParticleSystemComponents().forEach((comp: any) => {
            if (!comp.isPlaying) {
                comp.play();
                this._stoppedSet.delete(comp);
            }
        });
    }

    /**
     * 这个停止的行为会将递归找当前选中节点父节点，直到找到非包含粒子组件的节点为止，将找到的父节点一起停止。
     * 与 cocos-editor ParticleManager.stop 一致。
     */
    public stop() {
        this._getSelectedParticleSystemComponents().forEach((comp: any) => {
            if (!comp.isStopped) {
                comp.stop();
                this._stoppedSet.add(comp);
            }
        });
    }

    /**
     * 这个暂停的行为会将递归找当前选中的节点的父节点，直到找到非包含粒子组件的节点为止，将找到的父节点一起暂停。
     * 与 cocos-editor ParticleManager.pause 一致。
     */
    public pause() {
        this._getSelectedParticleSystemComponents().forEach((comp: any) => {
            if (!comp.isPaused) {
                comp.pause();
                this._stoppedSet.add(comp);
            }
        });
    }

    /**
     * 重新开始播放选中的粒子，与 cocos-editor ParticleManager.restart 一致。
     */
    public restart() {
        this._getSelectedParticleSystemComponents().forEach((comp: any) => {
            if (!comp.isStopped) {
                comp.stop();
            }
            if (!comp.isPlaying) {
                comp.play();
                this._stoppedSet.delete(comp);
            }
        });
    }

    /**
     * 通过组件 uuid 查找粒子组件实例。
     */
    private _findComponentByUuid(uuid: string): Component | null {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const ComponentManager = EditorExtends?.Component;
        if (ComponentManager?.query) {
            const comp = ComponentManager.query(uuid);
            if (comp && isParticleSystem(comp)) {
                return comp;
            }
        }
        // 退而求其次：从选中的粒子组件集合里查找
        for (const comp of this._getSelectedParticleSystemComponents()) {
            if ((comp as any).uuid === uuid) {
                return comp;
            }
        }
        return null;
    }
}
