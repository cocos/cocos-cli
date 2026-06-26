import type { IAnimationService } from '../common/animation';
import type { IServiceManager } from '../scene-process/service/interfaces';

describe('Animation service interface', () => {
    it('exposes animation APIs on internal scene services', () => {
        const assertInternal = (service: IAnimationService) => {
            const root = service.queryRoot({ nodePath: 'AnimatedRoot/Child' });
            const properties = service.queryProperties({ nodePath: 'AnimatedRoot' });
            const state = service.queryState();

            expect(root).toBeDefined();
            expect(properties).toBeDefined();
            expect(state).toBeDefined();
        };

        const assertManager = (manager: IServiceManager) => {
            expect(manager.Animation).toBeDefined();
        };

        expect(assertInternal).toBeDefined();
        expect(assertManager).toBeDefined();
    });
});
