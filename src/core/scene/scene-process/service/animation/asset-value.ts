import { Asset, assetManager as ccAssetManager, js } from 'cc';

export interface IAnimationAssetMetadata {
    type: { value: string };
    valueCtor?: new () => unknown;
}

export function isAnimationAssetValue(value: unknown): value is Asset {
    return typeof Asset === 'function' && value instanceof Asset;
}

export function serializeAnimationAssetValue(value: Asset): { uuid: string } | null {
    const uuid = queryAnimationAssetUuid(value);
    return uuid ? { uuid } : null;
}

export function queryAnimationAssetUuid(value: unknown): string {
    if (!value || typeof value !== 'object') {
        return '';
    }
    const record = value as Record<string, unknown>;
    const uuid = record.uuid || record._uuid || record.__uuid__;
    return typeof uuid === 'string' ? uuid : '';
}

export function queryAnimationAssetCtor(metadata: IAnimationAssetMetadata | null | undefined): (new () => Asset) | null {
    const ctor = metadata?.valueCtor || (metadata?.type?.value ? js.getClassByName(metadata.type.value) : null);
    if (typeof ctor !== 'function' || typeof Asset !== 'function') {
        return null;
    }
    return ctor === Asset || ctor.prototype instanceof Asset ? ctor as new () => Asset : null;
}

export function createAnimationAssetPlaceholder(assetCtor: new () => Asset, uuid: string): Asset {
    const asset = new assetCtor();
    asset.initDefault(uuid);
    return asset;
}

export async function loadAnimationAssetValue(assetCtor: new () => Asset, uuid: string): Promise<Asset> {
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
    return asset || createAnimationAssetPlaceholder(assetCtor, uuid);
}
