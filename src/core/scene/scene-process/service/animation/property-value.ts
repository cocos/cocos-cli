import { Node } from 'cc';
import type { IAnimationOperation, IAnimationValue } from '../../../common';
import type { IAnimationPropertyMetadata } from './property-curve';
import { findRelativeNodePathByUuid } from './property-curve';
import { queryAnimationPropertyMetadata } from './property-metadata';
import { getNodeByPath } from './scene-node';
import {
    isAnimationAssetValue,
    loadAnimationAssetValue,
    queryAnimationAssetCtor,
    queryAnimationAssetUuid,
    serializeAnimationAssetValue,
} from './asset-value';
import { cloneSerializableValue } from './utils';

type PropertyKeyOperation = Extract<IAnimationOperation, { type: 'createPropertyKey' | 'updatePropertyKey' }>;

export function serializeAnimationPropertyValue(value: unknown): IAnimationValue {
    if (isAnimationAssetValue(value)) {
        return serializeAnimationAssetValue(value);
    }
    const colorValue = serializeColorValue(value);
    if (colorValue) {
        return colorValue;
    }
    return cloneSerializableValue(value) as IAnimationValue;
}

function serializeColorValue(value: unknown): IAnimationValue | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const r = Number((value as any).r);
    const g = Number((value as any).g);
    const b = Number((value as any).b);
    const a = Number((value as any).a);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(a)) {
        return undefined;
    }
    return { r, g, b, a };
}

export async function normalizeProvidedAnimationPropertyOperationValue(
    rootNode: Node,
    rootPath: string,
    operation: PropertyKeyOperation,
    options: {
        queryNodeByUuid: (uuid: string) => Node | null;
        queryNodePath: (node: Node) => string;
    },
): Promise<IAnimationValue> {
    const value = operation.value;
    if (value === null || value === undefined) {
        return value as IAnimationValue;
    }

    const nodePath = resolveOperationRelativeNodePath(rootNode, rootPath, operation, options);
    if (nodePath === null) {
        return value;
    }

    const metadata = queryAnimationPropertyMetadata(rootNode, nodePath, operation.propKey);
    return await normalizeProvidedAnimationPropertyValue(metadata, value);
}

async function normalizeProvidedAnimationPropertyValue(
    metadata: IAnimationPropertyMetadata | null,
    value: IAnimationValue,
): Promise<IAnimationValue> {
    if (value === null || value === undefined) {
        return value;
    }

    const assetCtor = queryAnimationAssetCtor(metadata);
    if (!assetCtor) {
        return value;
    }
    if (value instanceof assetCtor) {
        return value as unknown as IAnimationValue;
    }

    const uuid = queryAnimationAssetUuid(value);
    if (!uuid) {
        return value;
    }

    return await loadAnimationAssetValue(assetCtor, uuid) as unknown as IAnimationValue;
}

function resolveOperationRelativeNodePath(
    rootNode: Node,
    rootPath: string,
    operation: { nodeUuid?: string; nodePath?: string },
    options: { queryNodeByUuid: (uuid: string) => Node | null; queryNodePath: (node: Node) => string },
): string | null {
    let targetUuid = operation.nodeUuid;
    if (!targetUuid) {
        const nodePath = normalizeNodePath(operation.nodePath || '');
        if (!nodePath) {
            return '';
        }
        const normalizedRootPath = normalizeNodePath(rootPath);
        let node: Node | null = null;
        if (normalizedRootPath && (nodePath === normalizedRootPath || nodePath.startsWith(`${normalizedRootPath}/`))) {
            node = getNodeByPath(nodePath);
        } else {
            node = rootNode.getChildByPath(nodePath);
        }
        if (!node) {
            return null;
        }
        targetUuid = node.uuid;
    }

    return findRelativeNodePathByUuid(rootNode, targetUuid);
}

function normalizeNodePath(path: string): string {
    return String(path || '').replace(/^\/+|\/+$/g, '');
}
