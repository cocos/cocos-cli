/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Material, Mat3, Mat4, Vec2, Vec3, Vec4, gfx, renderer } from 'cc';
import type { Node, animation } from 'cc';

export interface IAnimationUniformBinding {
    path: animation.TrackPath;
    proxy: animation.UniformProxyFactory;
}

export type IAnimationMaterialUniformSnapshot = {
    material: Material;
    passIndex: number;
    uniformName: string;
} & (
    | { values: renderer.MaterialProperty[] }
    | { texture: gfx.Texture; sampler: gfx.Sampler }
);

/**
 * 保存迁移轨道实际写入的材质状态
 *
 * UniformProxyFactory 没有读取接口，直接读取 Pass，分量轨道保存完整 uniform，数组保存全部元素
 */
export function captureMaterialUniforms(
    node: Node,
    bindings: IAnimationUniformBinding[],
): IAnimationMaterialUniformSnapshot[] {
    const snapshots: IAnimationMaterialUniformSnapshot[] = [];
    const captured = new Map<Material, Set<string>>();
    for (const { path, proxy } of bindings) {
        const material = path.trace(node);
        if (!(material instanceof Material)) {
            continue;
        }
        const { passIndex, uniformName } = proxy;
        const pass = material.passes[passIndex];
        const handle = pass?.getHandle(uniformName);
        if (!handle) {
            continue;
        }
        const key = JSON.stringify([passIndex, uniformName]);
        const keys = captured.get(material) ?? new Set<string>();
        if (keys.has(key)) {
            continue;
        }
        keys.add(key);
        captured.set(material, keys);

        const target = { material, passIndex, uniformName };
        const type = renderer.Pass.getTypeFromHandle(handle);
        if (type >= gfx.Type.SAMPLER1D) {
            // 代理直接更改描述符绑定，Material.getProperty() 无法反映当前纹理和采样器
            const binding = renderer.Pass.getBindingFromHandle(handle);
            snapshots.push({
                ...target,
                texture: pass.descriptorSet.getTexture(binding),
                sampler: pass.descriptorSet.getSampler(binding),
            });
            continue;
        }

        const count = renderer.Pass.getCountFromHandle(handle);
        const stride = gfx.GetTypeSize(type) / Float32Array.BYTES_PER_ELEMENT;
        const values: renderer.MaterialProperty[] = [];
        for (let index = 0; index < count; index++) {
            values.push(pass.getUniform(handle + index * stride, createUniformValue(type)));
        }
        snapshots.push({ ...target, values });
    }
    return snapshots;
}

/** 创建 Pass.getUniform 所需的输出值 */
function createUniformValue(type: number): renderer.MaterialProperty {
    switch (type) {
        case gfx.Type.INT2:
        case gfx.Type.FLOAT2:
            return new Vec2();
        case gfx.Type.INT3:
        case gfx.Type.FLOAT3:
            return new Vec3();
        case gfx.Type.INT4:
        case gfx.Type.FLOAT4:
            return new Vec4();
        case gfx.Type.MAT3:
            return new Mat3();
        case gfx.Type.MAT4:
            return new Mat4();
        default:
            return 0;
    }
}

/** 恢复材质当前 Pass，兼容组件属性恢复期间重建的 Pass */
export function restoreMaterialUniforms(snapshots: IAnimationMaterialUniformSnapshot[]): void {
    for (const snapshot of snapshots) {
        const pass = snapshot.material.passes[snapshot.passIndex];
        const handle = pass?.getHandle(snapshot.uniformName);
        if (!handle) {
            continue;
        }
        if ('values' in snapshot) {
            pass.setUniformArray(handle, snapshot.values);
        } else {
            const binding = renderer.Pass.getBindingFromHandle(handle);
            pass.bindTexture(binding, snapshot.texture);
            pass.bindSampler(binding, snapshot.sampler);
        }
    }
}
