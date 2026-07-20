import { assetManager, EffectAsset } from 'cc';
import { BaseService, register, ServiceEvents } from './core';
import { Rpc } from '../rpc';
import { messageManager } from './message';

interface IEffectAssetInfo {
    uuid: string;
    importer?: string;
    type?: string;
    ccType?: string;
}

@register('Effect')
export class EffectService extends BaseService<Record<string, any[]>> {
    private _uuidSet = new Set<string>();
    private _initialized = false;
    private _onAssetRefreshed = (uuid: string) => {
        this.onAssetChanged(uuid);
    };

    async init() {
        if (this._initialized) {
            return;
        }
        this._initialized = true;

        const uuids = await this.queryEffectUuids();
        await Promise.all(uuids.map((uuid) => this.register(uuid)));
        ServiceEvents.on('asset-refresh', this._onAssetRefreshed);
    }

    public registerMany(uuids: string[]) {
        uuids.forEach((uuid) => {
            void this.register(uuid);
        });
    }

    public register(uuid: string) {
        return new Promise<void>((resolve) => {
            if (!uuid) {
                resolve();
                return;
            }

            assetManager.loadAny(uuid, (err: any) => {
                if (err) {
                    console.error(err);
                    resolve();
                    return;
                }
                this._uuidSet.add(uuid);
                messageManager.broadcast('scene:effect-update', uuid);
                resolve();
            });
        });
    }

    public remove(uuid: string) {
        if (!this._uuidSet.has(uuid)) {
            return false;
        }
        if (EffectAsset && EffectAsset.remove) {
            this._uuidSet.delete(uuid);
            EffectAsset.remove(uuid);
            messageManager.broadcast('scene:effect-update', uuid);
            return true;
        }
        console.warn('cannot call method cc.EffectAsset.remove');
        return false;
    }

    public removeMany(uuids: string[]) {
        uuids.forEach((uuid) => {
            this.remove(uuid);
        });
    }

    public update(uuid: string) {
        this.remove(uuid);
        void this.register(uuid);
    }

    public onAssetChanged(uuid: string) {
        void this.syncAssetChanged(uuid);
    }

    public onAssetDeleted(uuid: string) {
        this.remove(uuid);
    }

    private async queryEffectUuids(): Promise<string[]> {
        try {
            const assets = await Rpc.getInstance().request('assetManager', 'queryAssetInfos', [{
                importer: 'effect',
                ccType: 'cc.EffectAsset',
            }]) as IEffectAssetInfo[];
            return (assets || [])
                .map((asset) => asset.uuid)
                .filter((uuid): uuid is string => typeof uuid === 'string' && uuid.length > 0);
        } catch (err) {
            console.warn('[Effect] Failed to query effects:', err);
            return [];
        }
    }

    private async syncAssetChanged(uuid: string) {
        const assetInfo = await this.queryAssetInfo(uuid);
        if (this.isEffectAsset(assetInfo)) {
            this.update(uuid);
        } else if (this._uuidSet.has(uuid)) {
            this.remove(uuid);
        }
    }

    private async queryAssetInfo(uuid: string): Promise<IEffectAssetInfo | null> {
        try {
            return await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]) as IEffectAssetInfo | null;
        } catch (err) {
            console.warn('[Effect] Failed to query effect:', err);
            return null;
        }
    }

    private isEffectAsset(assetInfo: IEffectAssetInfo | null): boolean {
        return assetInfo?.importer === 'effect'
            || assetInfo?.type === 'cc.EffectAsset'
            || assetInfo?.ccType === 'cc.EffectAsset';
    }
}
