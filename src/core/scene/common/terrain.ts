import type { Terrain } from 'cc';

/** Terrain 编辑器的非 UI 接口；pink 只需要调用这些接口。 */
export interface ITerrainService {
    readonly name: 'cc.Terrain';
    readonly editedComponents: Terrain[];
    readonly selectedComponents: Terrain[];
    isTerrainChange: boolean;
    select(nodeUuid: string): void;
    unselect(nodeUuid: string): void;
    close(): Promise<0 | 1 | 2>;
    saveAsset(isClose?: boolean, component?: Terrain): Promise<0 | 1 | 2>;
    saveAssetDialog(file?: string, isClose?: boolean): Promise<0 | 1 | 2>;
    addAssetToComp(assetUuid: string): Promise<void>;
    serialize(component: Terrain): Uint8Array;
    onSculpt(node: any): void;
}

export type IPublicTerrainService = Pick<ITerrainService,
    'name' | 'isTerrainChange' | 'select' | 'unselect' | 'close' |
    'saveAsset' | 'saveAssetDialog' | 'addAssetToComp'
>;

export interface ITerrainEvents {
    'terrain:changed': [component: Terrain];
    'terrain:sculpt': [node: any];
    'terrain:block-update': [];
}
