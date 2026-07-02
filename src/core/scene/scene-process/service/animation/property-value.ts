import { Asset, Node, assetManager as ccAssetManager, js } from 'cc';
import type { IAnimationOperation, IAnimationValue } from '../../../common';
import type { IAnimationPropertyMetadata } from './property-curve';
import { queryAnimationPropertyMetadata } from './property-metadata';
import { cloneValue } from './utils';

type PropertyKeyOperation = Extract<IAnimationOperation, { type: 'createPropertyKey' | 'updatePropertyKey' }>;

export function serializeAnimationPropertyValue(value: unknown): IAnimationValue {
    if (value instanceof Asset) {
        const uuid = queryAssetUuid(value);
        return uuid ? { uuid } : null;
    }
    return cloneValue(value) as IAnimationValue;
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

    const assetCtor = metadata ? queryAssetValueCtor(metadata) : null;
    if (!assetCtor) {
        return value;
    }
    if (value instanceof assetCtor) {
        return value as unknown as IAnimationValue;
    }

    const uuid = queryAssetUuid(value);
    if (!uuid) {
        return value;
    }

    return await loadAssetValue(assetCtor, uuid) as unknown as IAnimationValue;
}

function resolveOperationRelativeNodePath(
    rootNode: Node,
    rootPath: string,
    operation: { nodeUuid?: string; nodePath?: string },
    options: { queryNodeByUuid: (uuid: string) => Node | null; queryNodePath: (node: Node) => string },
): string | null {
    const node = options.queryNodeByUuid(operation.nodeUuid || '');
    if (node) {
        return toRelativeNodePath(rootNode, rootPath, options.queryNodePath(node));
    }
    return toRelativeNodePath(rootNode, rootPath, operation.nodePath || '');
}

function toRelativeNodePath(rootNode: Node, rootPath: string, nodePath: string): string | null {
    const normalizedRootPath = normalizeNodePath(rootPath);
    const normalizedNodePath = normalizeNodePath(nodePath);
    if (!normalizedNodePath || normalizedNodePath === normalizedRootPath) {
        return '';
    }
    if (normalizedRootPath && normalizedNodePath.startsWith(`${normalizedRootPath}/`)) {
        return normalizedNodePath.slice(normalizedRootPath.length + 1);
    }
    return rootNode.getChildByPath(normalizedNodePath) ? normalizedNodePath : null;
}

function normalizeNodePath(path: string): string {
    return String(path || '').replace(/^\/+|\/+$/g, '');
}

function queryAssetUuid(value: unknown): string {
    if (!value || typeof value !== 'object') {
        return '';
    }
    const record = value as Record<string, unknown>;
    const uuid = record.uuid || record._uuid || record.__uuid__;
    return typeof uuid === 'string' ? uuid : '';
}

function queryAssetValueCtor(metadata: IAnimationPropertyMetadata): (new () => Asset) | null {
    const ctor = metadata.valueCtor || js.getClassByName(metadata.type.value);
    if (typeof ctor !== 'function') {
        return null;
    }
    return ctor === Asset || ctor.prototype instanceof Asset ? ctor as new () => Asset : null;
}

async function loadAssetValue(assetCtor: new () => Asset, uuid: string): Promise<Asset> {
    const asset = await new Promise<Asset | null>((resolve) => {
        ccAssetManager.loadAny(uuid, (error: Error | null, loaded: unknown) => {
            if (error) {
                console.warn(`[Animation] load asset keyframe value failed: ${uuid}`, error);
                resolve(null);
                return;
            }
            resolve(loaded instanceof assetCtor ? loaded as Asset : null);
        });
    });
    if (asset) {
        return asset;
    }
    const placeholder = new assetCtor();
    placeholder.initDefault(uuid);
    return placeholder;
}
