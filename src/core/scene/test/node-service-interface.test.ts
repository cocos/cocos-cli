import type { INodeService, IPublicNodeService } from '../common/node';

describe('Node service interface', () => {
    it('exposes asset query APIs only on the internal node service', () => {
        const assertInternal = (service: INodeService) => {
            const nodesByAsset: string[] = service.queryNodesByAssetUuid('asset-uuid');
            const nodesMissAsset: Promise<string[]> = service.queryNodesMissAsset();

            expect(nodesByAsset).toBeDefined();
            expect(nodesMissAsset).toBeDefined();
        };

        const assertPublic = (service: IPublicNodeService) => {
            // @ts-expect-error asset query APIs are internal-only.
            service.queryNodesByAssetUuid('asset-uuid');
            // @ts-expect-error asset query APIs are internal-only.
            service.queryNodesMissAsset();
        };

        expect(assertInternal).toBeDefined();
        expect(assertPublic).toBeDefined();
    });
});
