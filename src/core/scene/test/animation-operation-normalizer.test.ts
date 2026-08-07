const mockNormalizeProvidedValue = jest.fn();
const mockExtractSampledValue = jest.fn();

jest.mock('../scene-process/service/animation/property-value', () => ({
    normalizeProvidedAnimationPropertyOperationValue: mockNormalizeProvidedValue,
}));

jest.mock('../scene-process/service/animation/scene-node', () => ({
    extractSampledOperationValue: mockExtractSampledValue,
}));

const { normalizeAnimationOperation } = require('../scene-process/service/animation/operation-normalizer');

describe('normalizeAnimationOperation', () => {
    const rootNode = {} as any;
    const queryPropertyValueAtFrame = jest.fn();
    const context = {
        currentClipUuid: 'current-clip',
        rootNode,
        rootPath: 'Root',
        queryPropertyValueAtFrame,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes unrelated operations through unchanged', async () => {
        const operation = { type: 'changeSample', clipUuid: 'current-clip', sample: 60 };

        await expect(normalizeAnimationOperation(operation, context)).resolves.toBe(operation);
        expect(mockNormalizeProvidedValue).not.toHaveBeenCalled();
    });

    it('keeps updatePropertyKeyData unchanged when keyData is already present', async () => {
        const operation = {
            type: 'updatePropertyKeyData',
            clipUuid: 'current-clip',
            nodePath: 'Enemy',
            propKey: 'position',
            frame: 10,
            keyData: { interpMode: 1 },
        };

        await expect(normalizeAnimationOperation(operation, context)).resolves.toBe(operation);
    });

    it('upgrades legacy curveData on updatePropertyKeyData', async () => {
        const operation = {
            type: 'updatePropertyKeyData',
            clipUuid: 'current-clip',
            nodePath: 'Enemy',
            propKey: 'position',
            frame: 10,
            curveData: { interpMode: 1 },
        };

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            ...operation,
            keyData: operation.curveData,
        });
    });

    it('normalizes a provided property value and upgrades legacy curveData to keyData', async () => {
        const operation = {
            type: 'createPropertyKey',
            clipUuid: 'current-clip',
            nodeUuid: 'enemy-uuid',
            propKey: 'position',
            frame: 0,
            value: { x: 1, y: 2, z: 3 },
            curveData: { interpMode: 1 },
        };
        const normalizedValue = { x: 4, y: 5, z: 6 };
        mockNormalizeProvidedValue.mockResolvedValue(normalizedValue);

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            ...operation,
            keyData: operation.curveData,
            value: normalizedValue,
        });
        expect(mockNormalizeProvidedValue).toHaveBeenCalledWith(rootNode, 'Root', operation);
        expect(queryPropertyValueAtFrame).not.toHaveBeenCalled();
    });

    it('converts an update containing only key data without sampling a value', async () => {
        const operation = {
            type: 'updatePropertyKey',
            clipUuid: 'current-clip',
            nodePath: 'Enemy',
            propKey: 'position',
            frame: 10,
            channel: 'x',
            keyData: { broken: true },
        };

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            ...operation,
            type: 'updatePropertyKeyData',
        });
        expect(queryPropertyValueAtFrame).not.toHaveBeenCalled();
    });

    it('samples an omitted value and extracts the requested channel', async () => {
        const operation = {
            type: 'createPropertyKey',
            clipUuid: '',
            nodeUuid: 'enemy-uuid',
            nodePath: 'ignored-when-uuid-is-present',
            propKey: 'position',
            frame: 15,
            channel: 'y',
        };
        queryPropertyValueAtFrame.mockResolvedValue({ x: 1, y: 2, z: 3 });
        mockExtractSampledValue.mockReturnValue(2);

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            ...operation,
            keyData: undefined,
            value: 2,
        });
        expect(queryPropertyValueAtFrame).toHaveBeenCalledWith({
            clipUuid: 'current-clip',
            nodePath: operation.nodePath,
            nodeUuid: operation.nodeUuid,
            propKey: operation.propKey,
            frame: operation.frame,
        });
        expect(mockExtractSampledValue).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 'y');
    });

    it('returns a failure when sampling produces no usable value', async () => {
        const operation = {
            type: 'createPropertyKey',
            clipUuid: 'current-clip',
            propKey: 'position',
            frame: 20,
        };
        queryPropertyValueAtFrame.mockResolvedValue({ x: 1 });
        mockExtractSampledValue.mockReturnValue(undefined);

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            state: 'failure',
            result: false,
            reason: 'Failed to sample animation property value: position',
        });
    });

    it('returns the sampling error as an operation failure', async () => {
        const operation = {
            type: 'createPropertyKey',
            clipUuid: 'current-clip',
            propKey: 'position',
            frame: 30,
        };
        queryPropertyValueAtFrame.mockRejectedValue(new Error('sample failed'));

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            state: 'failure',
            result: false,
            reason: 'sample failed',
        });
    });

    it('normalizes a non-Error sampling rejection into a failure reason', async () => {
        const operation = {
            type: 'createPropertyKey',
            clipUuid: 'current-clip',
            propKey: 'position',
            frame: 30,
        };
        queryPropertyValueAtFrame.mockRejectedValue('sample failed');

        await expect(normalizeAnimationOperation(operation, context)).resolves.toEqual({
            state: 'failure',
            result: false,
            reason: 'sample failed',
        });
    });
});
