import cc from 'cc';
import { Rpc } from '../../rpc';
import { PrefabWriteConflict } from './write-runtime';
import { prefabWriteSession } from './write-session';
import type { IPrefabSourceSnapshot } from '../../../common/prefab-write';

// Source replacement is exclusive in the runtime. Nested asset loads join that
// operation and must not publish a baseline before the complete tree is restored.
let replacementDepth = 0;

/** Capture before loading and verify after loading; never adopt a version from a notification. */
export async function loadWithPrefabSources<T>(roots: string[], load: () => Promise<T>, replaceExisting = false): Promise<T> {
    if (!prefabWriteSession.active) return load();
    const visited = new Set<string>();
    const sources: IPrefabSourceSnapshot[] = [];
    const visit = async (uuid: string): Promise<void> => {
        if (visited.has(uuid)) return;
        visited.add(uuid);
        const rpc = Rpc.getInstance();
        const info = await rpc.request('assetManager', 'queryAssetInfo', [uuid]);
        if (!info) return;
        if (!['cc.Prefab', 'cc.SceneAsset', 'prefab', 'scene'].includes(info.type)) return;
        if (info.type === 'cc.Prefab' && !uuid.includes('@')) sources.push(await prefabWriteSession.readSource(uuid));
        const dependencies = await rpc.request('assetManager', 'queryAssetDependencies', [uuid]);
        for (const dependency of dependencies) await visit(dependency);
    };
    for (const root of roots) await visit(root);
    for (const source of sources) {
        const loaded = prefabWriteSession.knownBaseline(source.assetUuid);
        if (!replaceExisting && !replacementDepth && loaded && loaded.fingerprint !== source.fingerprint) {
            throw new PrefabWriteConflict({ code: 'PREFAB_SOURCE_CHANGED', message: 'Reload existing instances before loading another version of this Prefab.', commitState: 'not-committed', assetUuid: source.assetUuid });
        }
    }
    // Dependencies can otherwise retain an older Prefab even when the root is evicted.
    for (const source of sources) cc.assetManager.assets.remove(source.assetUuid);
    const nestedReplacement = replacementDepth > 0;
    if (replaceExisting) replacementDepth++;
    let result: T;
    try { result = await load(); } finally { if (replaceExisting) replacementDepth--; }
    for (const source of sources) {
        const current = await prefabWriteSession.readSource(source.assetUuid);
        if (current.fingerprint !== source.fingerprint) {
            throw new PrefabWriteConflict({ code: 'PREFAB_SOURCE_CHANGED', message: 'The Prefab changed while its content was loading. Reload before editing.', commitState: 'not-committed', assetUuid: source.assetUuid });
        }
    }
    if (!nestedReplacement) for (const source of sources) prefabWriteSession.loaded(source);
    return result;
}
