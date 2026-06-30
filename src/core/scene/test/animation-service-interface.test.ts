import type {
    IAnimationClipDump,
    IAnimationOperationResult,
    IAnimationRootInfo,
    IAnimationService,
    IAnimationValue,
} from '../common/animation';
import type { IServiceManager } from '../scene-process/service/interfaces';

describe('Animation service interface', () => {
    it('exposes animation APIs on internal scene services', () => {
        const assertInternal = (service: IAnimationService) => {
            const root = service.queryRoot({ nodePath: 'AnimatedRoot/Child' });
            const properties = service.queryProperties({ nodePath: 'AnimatedRoot' });
            const state = service.queryState();
            const clip = service.queryClip({ clipUuid: 'clip-uuid' });
            const frameValue = service.queryPropertyValueAtFrame({ clipUuid: 'clip-uuid', nodePath: 'AnimatedRoot', propKey: 'position', frame: 0 });
            const auxFrameValue = service.queryAuxiliaryCurveValueAtFrame({ clipUuid: 'clip-uuid', name: 'BlendWeight', frame: 0 });
            const operation = service.applyOperation({ operations: [{ type: 'changeSample', clipUuid: 'clip-uuid', sample: 60 }] });
            const propertyOperation = service.applyOperation({ operations: [{ type: 'createPropertyKey', clipUuid: 'clip-uuid', nodePath: 'AnimatedRoot', propKey: 'position', frame: 0, value: { x: 0, y: 0, z: 0 } }] });
            const keyDataOperation = service.applyOperation({ operations: [{ type: 'updatePropertyKeyData', clipUuid: 'clip-uuid', nodePath: 'AnimatedRoot', propKey: 'position', frame: 0, channel: 'x', keyData: { broken: true } }] });

            expect(root).toBeDefined();
            expect(properties).toBeDefined();
            expect(state).toBeDefined();
            expect(clip).toBeDefined();
            expect(frameValue).toBeDefined();
            expect(auxFrameValue).toBeDefined();
            expect(operation).toBeDefined();
            expect(propertyOperation).toBeDefined();
            expect(keyDataOperation).toBeDefined();
        };

        const assertRootInfo = (info: IAnimationRootInfo) => {
            const nodeChildren = info.nodeTreeDump?.children ?? [];
            const clipEvents = info.clipDump?.events ?? [];
            expect(nodeChildren).toBeDefined();
            expect(clipEvents).toBeDefined();
        };

        const assertClipDump = (dump: IAnimationClipDump) => {
            const curve = dump.curves[0];
            const keyframe = curve?.keyframes?.[0];
            const embeddedPlayer = dump.embeddedPlayers[0];
            const auxiliaryKey = dump.auxiliaryCurves.BlendWeight?.keyframes[0];

            expect(keyframe?.frame).toBeDefined();
            expect(embeddedPlayer?.playable?.type).toBeDefined();
            expect(auxiliaryKey?.value).toBeDefined();
        };

        const assertOperationResult = (result: IAnimationOperationResult) => {
            const value: boolean = result.result;
            expect(value).toBeDefined();
        };

        const assertPropertyValue = (value: IAnimationValue) => {
            expect(value).toBeDefined();
        };

        const assertManager = (manager: IServiceManager) => {
            expect(manager.Animation).toBeDefined();
        };

        expect(assertInternal).toBeDefined();
        expect(assertRootInfo).toBeDefined();
        expect(assertClipDump).toBeDefined();
        expect(assertOperationResult).toBeDefined();
        expect(assertPropertyValue).toBeDefined();
        expect(assertManager).toBeDefined();
    });
});
