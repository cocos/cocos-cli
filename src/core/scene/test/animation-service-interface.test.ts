import type { IAnimationService } from '../common/animation';
import type { IServiceManager } from '../scene-process/service/interfaces';

describe('Animation service interface', () => {
    it('exposes animation APIs on internal scene services', () => {
        const assertInternal = (service: IAnimationService) => {
            const root = service.queryRoot({ nodePath: 'AnimatedRoot/Child' });
            const properties = service.queryProperties({ nodePath: 'AnimatedRoot' });
            const state = service.queryState();
            const clip = service.queryClip({ clipUuid: 'clip-uuid' });
            const frameValue = service.queryPropertyValueAtFrame({ clipUuid: 'clip-uuid', nodePath: 'AnimatedRoot', propKey: 'position', frame: 0 });
            const operation = service.applyOperation({ operations: [{ funcName: 'changeSample', args: ['clip-uuid', 60] }] });

            expect(root).toBeDefined();
            expect(properties).toBeDefined();
            expect(state).toBeDefined();
            expect(clip).toBeDefined();
            expect(frameValue).toBeDefined();
            expect(operation).toBeDefined();
        };

        const assertManager = (manager: IServiceManager) => {
            expect(manager.Animation).toBeDefined();
        };

        expect(assertInternal).toBeDefined();
        expect(assertManager).toBeDefined();
    });
});
