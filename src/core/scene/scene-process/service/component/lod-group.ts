import { Component, LODGroup } from 'cc';
import { LODGroupEditorUtility } from 'cc/editor/lod-group-utils';

import type { ILODGroupBoundsResult, ILODGroupLevelsResult } from '../../../common';

const MAX_LOD_COUNT = 8;
const MIN_LOD_COUNT = 1;

export function requireLODGroup(component: Component | null, path: string): LODGroup {
    if (!component) {
        throw new Error(`LODGroup component not found: ${path}`);
    }
    if (!(component instanceof LODGroup)) {
        throw new Error(`Parameter error: component is not cc.LODGroup: ${path}`);
    }
    return component;
}

export function validateLODInsert(
    lodGroup: LODGroup,
    index: number,
    screenUsagePercentage?: number,
): void {
    if (!Number.isInteger(index) || index < 0 || index > lodGroup.lodCount) {
        throw new Error(`Parameter error: LOD insert index must be an integer in [0, ${lodGroup.lodCount}]: ${index}`);
    }
    if (lodGroup.lodCount >= MAX_LOD_COUNT) {
        throw new Error(`Parameter error: LODGroup cannot contain more than ${MAX_LOD_COUNT} LOD levels`);
    }
    if (screenUsagePercentage !== undefined
        && (!Number.isFinite(screenUsagePercentage) || screenUsagePercentage <= 0 || screenUsagePercentage > 1)) {
        throw new Error(`Parameter error: screenUsagePercentage must be in (0, 1]: ${screenUsagePercentage}`);
    }
}

export function validateLODErase(lodGroup: LODGroup, index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= lodGroup.lodCount) {
        throw new Error(`Parameter error: LOD erase index must be an integer in [0, ${lodGroup.lodCount - 1}]: ${index}`);
    }
    if (lodGroup.lodCount <= MIN_LOD_COUNT) {
        throw new Error(`Parameter error: LODGroup must contain at least ${MIN_LOD_COUNT} LOD level`);
    }
}

export function serializeLODGroupLevels(lodGroup: LODGroup): ILODGroupLevelsResult {
    const screenUsagePercentages: number[] = [];
    for (let index = 0; index < lodGroup.lodCount; index++) {
        const lod = lodGroup.getLOD(index);
        if (!lod) {
            throw new Error(`LODGroup data is inconsistent: LOD ${index} does not exist`);
        }
        screenUsagePercentages.push(lod.screenUsagePercentage);
    }
    return {
        lodCount: lodGroup.lodCount,
        screenUsagePercentages,
    };
}

export function serializeLODGroupBounds(lodGroup: LODGroup): ILODGroupBoundsResult {
    // 当前 cc 模块声明遗漏了引擎中已存在的 public localBoundaryCenter getter。
    const center = (lodGroup as LODGroup & {
        readonly localBoundaryCenter: Readonly<{ x: number; y: number; z: number }>;
    }).localBoundaryCenter;
    return {
        localBoundaryCenter: {
            x: center.x,
            y: center.y,
            z: center.z,
        },
        objectSize: lodGroup.objectSize,
    };
}

type LODRenderCamera = Parameters<typeof LODGroupEditorUtility.getRelativeHeight>[1];

export function queryLODGroupRelativeHeight(lodGroup: LODGroup, camera: LODRenderCamera): number {
    const { x, y, z } = lodGroup.node.scale;
    const worldSpaceSize = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) * lodGroup.objectSize;
    if (worldSpaceSize === 0) {
        return 0;
    }

    const relativeHeight = LODGroupEditorUtility.getRelativeHeight(lodGroup, camera);
    if (relativeHeight === null || !Number.isFinite(relativeHeight)) {
        throw new Error('Unable to query LODGroup relative height');
    }
    return relativeHeight;
}
