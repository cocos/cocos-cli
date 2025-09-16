import * as cc from 'cc';
import { Constructor } from 'cc';
import { SerializedAssetFinder } from '../../meta-schemas/glTF.meta';
import { GltfAssetFinderKind, IGltfAssetFinder } from '../utils/gltf-converter';
import { loadAssetSync } from '../utils/load-asset-sync';

export type MyFinderKind = GltfAssetFinderKind | 'scenes';

export class DefaultGltfAssetFinder implements IGltfAssetFinder {
    constructor(private _assetDetails: SerializedAssetFinder = {}) {}

    public serialize() {
        return this._assetDetails;
    }

    public set(kind: MyFinderKind, values: Array<string | null>) {
        this._assetDetails[kind] = values;
    }

    public find<T extends cc.Asset>(kind: MyFinderKind, index: number, type: Constructor<T>): T | null {
        const uuids = this._assetDetails[kind];
        if (uuids === undefined) {
            return null;
        }
        const detail = uuids[index];
        if (detail === null) {
            return null;
        } else {
            return loadAssetSync(detail, type) || null;
        }
    }
}
