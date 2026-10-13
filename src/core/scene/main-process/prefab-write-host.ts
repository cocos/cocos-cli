import { readFile } from 'fs-extra';
import { assetManager } from '../../assets';
import type {
    IBeginPrefabEditOptions,
    ICommitPrefabWriteOptions,
    IFinishPrefabEditOptions,
    IPrefabRuntimeRegistration,
    IPrefabWriteHost,
    IRegisterPrefabRuntimeOptions,
    PrefabWriteResult,
} from '../common/prefab-write';
import { PrefabWriteCoordinator, PrefabWriteError, type IPrefabSourceStore } from './prefab-write-coordinator';

/** Resolves UUIDs in the current project on every operation, including after asset moves. */
export class AssetDBPrefabSourceStore implements IPrefabSourceStore {
    private querySource(assetUuid: string): string {
        const asset = assetManager.queryAssetInfo(assetUuid);
        if (!asset || asset.uuid !== assetUuid || asset.type !== 'cc.Prefab' || !asset.file || assetUuid.includes('@')) {
            throw new PrefabWriteError('PREFAB_SOURCE_UNAVAILABLE', 'The writable Prefab source is unavailable.', 'not-committed', assetUuid);
        }
        return asset.file;
    }

    async read(assetUuid: string): Promise<Buffer> {
        return readFile(this.querySource(assetUuid));
    }

    async write(assetUuid: string, content: string): Promise<void> {
        this.querySource(assetUuid);
        const saved = await assetManager.saveAsset(assetUuid, content);
        if (saved?.uuid !== assetUuid) throw new Error('The saved Prefab identity does not match the requested source.');
    }
}

/** JSON-safe Adapter; domain failures survive both HTTP and worker reverse RPC unchanged. */
export class PrefabWriteHost implements IPrefabWriteHost {
    constructor(private readonly coordinator: PrefabWriteCoordinator) {}

    registerRuntime(options: IRegisterPrefabRuntimeOptions) {
        return this.run(() => this.coordinator.registerRuntime(options));
    }

    queryRuntime(registration: IPrefabRuntimeRegistration) {
        return this.run(() => this.coordinator.queryRuntime(registration));
    }

    beginEdit(options: IBeginPrefabEditOptions) {
        return this.run(() => this.coordinator.beginEdit(options));
    }

    finishEdit(options: IFinishPrefabEditOptions) {
        return this.run(() => {
            this.coordinator.finishEdit(options);
            return null;
        });
    }

    markRuntimeUnavailable(registration: IPrefabRuntimeRegistration) {
        return this.run(() => {
            this.coordinator.markRuntimeUnavailable(registration);
            return null;
        });
    }

    unregisterRuntime(registration: IPrefabRuntimeRegistration) {
        return this.run(() => {
            this.coordinator.unregisterRuntime(registration);
            return null;
        });
    }

    readSource(assetUuid: string) {
        return this.run(() => this.coordinator.readSource(assetUuid));
    }

    commit(options: ICommitPrefabWriteOptions) {
        return this.run(() => this.coordinator.commit(options));
    }

    reset(): Promise<void> {
        return this.coordinator.reset();
    }

    private async run<T>(operation: () => T | Promise<T>): Promise<PrefabWriteResult<T>> {
        try {
            return { ok: true, value: await operation() };
        } catch (error) {
            if (!(error instanceof PrefabWriteError)) throw error;
            return {
                ok: false,
                error: {
                    code: error.code,
                    message: error.message,
                    commitState: error.commitState,
                    assetUuid: error.assetUuid,
                    runtime: error.runtime ? { runtimeId: error.runtime.runtimeId, generation: error.runtime.generation } : undefined,
                },
            };
        }
    }
}

/** One project Host owns this instance, shared by all reverse-RPC transports. */
export const prefabWriteHost = new PrefabWriteHost(new PrefabWriteCoordinator(new AssetDBPrefabSourceStore()));
