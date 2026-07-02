import type { Node } from 'cc';
import type {
    IAnimationOperation,
    IAnimationOperationResult,
    IAnimationQueryPropertyValueAtFrameOptions,
    IAnimationValue,
} from '../../../common';
import { normalizeProvidedAnimationPropertyOperationValue } from './property-value';
import {
    extractSampledOperationValue,
    getNodeByUuid,
    getNodePath,
} from './scene-node';

type PropertyKeyOperation = Extract<IAnimationOperation, { type: 'createPropertyKey' | 'updatePropertyKey' }>;

interface IAnimationOperationNormalizerContext {
    currentClipUuid: string;
    rootNode: Node;
    rootPath: string;
    queryPropertyValueAtFrame(options: IAnimationQueryPropertyValueAtFrameOptions): Promise<IAnimationValue>;
}

export async function normalizeAnimationOperation(
    operation: IAnimationOperation,
    context: IAnimationOperationNormalizerContext,
): Promise<IAnimationOperation | IAnimationOperationResult> {
    const type = (operation as any)?.type;
    if (type === 'updatePropertyKeyData') {
        const keyOperation = operation as Extract<IAnimationOperation, { type: 'updatePropertyKeyData' }>;
        const keyData = keyOperation.keyData ?? keyOperation.curveData;
        return keyData === keyOperation.keyData ? operation : { ...keyOperation, keyData };
    }
    if (type !== 'createPropertyKey' && type !== 'updatePropertyKey') {
        return operation;
    }

    return normalizePropertyKeyOperation(operation as PropertyKeyOperation, context);
}

async function normalizePropertyKeyOperation(
    operation: PropertyKeyOperation,
    context: IAnimationOperationNormalizerContext,
): Promise<IAnimationOperation | IAnimationOperationResult> {
    const keyData = operation.keyData ?? operation.curveData;
    if (operation.value !== undefined) {
        const value = await normalizeProvidedAnimationPropertyOperationValue(context.rootNode, context.rootPath, operation, {
            queryNodeByUuid: (uuid) => getNodeByUuid(uuid),
            queryNodePath: (node) => getNodePath(node),
        });
        return { ...operation, keyData, value };
    }
    if (operation.type === 'updatePropertyKey' && keyData) {
        return {
            ...operation,
            type: 'updatePropertyKeyData',
            keyData,
        };
    }

    try {
        const sampled = await context.queryPropertyValueAtFrame({
            clipUuid: operation.clipUuid || context.currentClipUuid,
            nodePath: operation.nodePath,
            nodeUuid: operation.nodeUuid,
            propKey: operation.propKey,
            frame: operation.frame,
        });
        const value = extractSampledOperationValue(sampled, operation.channel);
        if (value === undefined) {
            return {
                state: 'failure',
                result: false,
                reason: `Failed to sample animation property value: ${operation.propKey}`,
            };
        }
        return { ...operation, keyData, value };
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        return {
            state: 'failure',
            result: false,
            reason: normalized.message,
        };
    }
}
