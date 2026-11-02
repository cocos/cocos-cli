/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Component, MeshRenderer, Node, animation } from 'cc';
import { isAnimationAssetValue } from './asset-value';
import { isWritableProperty } from './property-writability';
import {
    captureAnimationSampledState,
    restoreAnimationSampledState,
    type IAnimationSampledNodeState,
} from './sampled-state';
import {
    captureMaterialUniforms,
    restoreMaterialUniforms,
    type IAnimationUniformBinding,
    type IAnimationMaterialUniformSnapshot,
} from './material-uniform-snapshot';

export interface IAnimationMigrationNodeState extends IAnimationSampledNodeState {
    materialUniforms: IAnimationMaterialUniformSnapshot[];
    propertyBindings?: Array<{ path: animation.TrackPath; value: unknown }>;
    morphWeights?: Array<{ componentUuid: string; weights: number[][] }>;
}

export interface IAnimationMigrationBinding {
    path: animation.TrackPath;
    proxy?: animation.Track['proxy'];
}

/** 保存迁移节点自身的独立属性值、材质代理状态和形变权重 */
export function captureAnimationMigrationState(
    node: Node,
    bindings: IAnimationMigrationBinding[],
): IAnimationMigrationNodeState {
    const uniformBindings: IAnimationUniformBinding[] = [];
    const propertyBindings: NonNullable<IAnimationMigrationNodeState['propertyBindings']> = [];
    for (const { path, proxy } of bindings) {
        if (proxy instanceof animation.UniformProxyFactory) {
            uniformBindings.push({ path, proxy });
        } else if (!proxy) {
            const property = resolveMigrationProperty(node, path);
            if (property) {
                propertyBindings.push({
                    path,
                    value: cloneMigrationValue(property.target[property.key]),
                });
            }
        }
    }
    return {
        ...cloneMigrationValue(captureAnimationSampledState(node, { includeChildren: false })),
        materialUniforms: captureMaterialUniforms(node, uniformBindings),
        propertyBindings,
        // 恢复 mesh 会重置所有形变权重，包含未被迁移轨道直接写入的权重
        morphWeights: node.getComponents(MeshRenderer).map(component => ({
            componentUuid: component.uuid,
            weights: (component.mesh?.struct.morph?.subMeshMorphs ?? []).map((morph, subMesh) =>
                morph?.targets.map((_, shape) => component.getWeight(subMesh, shape)) ?? []),
        })),
    };
}

/** 恢复迁移节点，使用独立副本防止后续采样污染撤销和重做快照 */
export async function restoreAnimationMigrationState(
    node: Node,
    state: IAnimationMigrationNodeState,
): Promise<void> {
    const { materialUniforms, propertyBindings = [], morphWeights = [], ...sampledState } = state;
    await restoreAnimationSampledState(node, cloneMigrationValue(sampledState));
    // 重新沿路径定位叶子，组件属性恢复可能已替换其中的对象实例
    for (const { path, value } of propertyBindings) {
        const property = resolveMigrationProperty(node, path);
        if (property) {
            property.target[property.key] = cloneMigrationValue(value);
        }
    }
    // 组件及叶子属性均恢复后再还原权重，避免 mesh setter 覆盖快照值
    for (const { componentUuid, weights } of morphWeights) {
        const component = node.components.find(item => item.uuid === componentUuid);
        if (component instanceof MeshRenderer) {
            weights.forEach((values, subMesh) => component.setWeights(values, subMesh));
        }
    }
    restoreMaterialUniforms(materialUniforms);
}

/** 定位原始轨道实际写入的字段，允许中间路径经过 getter 或数组 */
function resolveMigrationProperty(
    node: Node,
    path: animation.TrackPath,
): { target: Record<string, unknown>; key: string } | null {
    const last = path.length - 1;
    if (!path.isPropertyAt(last) && !path.isElementAt(last)) {
        return null;
    }
    const target = path.trace(node, 0, last);
    const key = path.isPropertyAt(last)
        ? path.parsePropertyAt(last)
        : String(path.parseElementAt(last));
    if (!target || typeof target !== 'object' || !isWritableProperty(target, key)) {
        return null;
    }
    return { target: target as Record<string, unknown>, key };
}

/**
 * 复制迁移快照中的可变值
 *
 * CCClass 按引擎序列化字段复制，保留构造初始化、共享关系和循环引用，资源及场景对象保留引用
 */
function cloneMigrationValue<T>(value: T, copies = new Map<object, any>()): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (isAnimationAssetValue(value) || value instanceof Node || value instanceof Component) {
        return value;
    }
    if (copies.has(value)) {
        return copies.get(value);
    }
    if (typeof (value as any).clone === 'function') {
        const result = (value as any).clone();
        copies.set(value, result);
        return result;
    }
    if (Array.isArray(value)) {
        const result: unknown[] = [];
        copies.set(value, result);
        for (const item of value) {
            result.push(cloneMigrationValue(item, copies));
        }
        return result as T;
    }
    const ctor = value.constructor as { new(): Record<string, unknown>; __values__?: string[] };
    const properties = Array.isArray(ctor?.__values__) ? ctor.__values__ : undefined;
    const prototype = Object.getPrototypeOf(value);
    if (!properties && prototype !== Object.prototype && prototype !== null) {
        return value;
    }

    const result = properties ? new ctor() : Object.create(prototype);
    copies.set(value, result);
    for (const key of properties ?? Object.keys(value)) {
        result[key] = cloneMigrationValue((value as Record<string, unknown>)[key], copies);
    }
    return result as T;
}
