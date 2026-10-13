import { readFile, stat } from 'fs-extra';

import type { IAsset } from './@types/protected';
import assetQuery from './manager/query';
import assetOperation from './manager/operation';

declare const EditorExtends: any;

function getCC(): any {
    return require('cc');
}

function getNewGenAnim(): any {
    return require('cc/editor/new-gen-anim');
}

export interface AnimGraphVariantDump {
    graphUuid: string | null;
    clips: Record<string, string>;
    invalids?: Record<string, string>;
}

interface PendingAnimationGraphVariantEdit {
    uuid: string;
    source: string;
    sourceMtimeMs: number | null;
    assetDbMtime: number | null;
    graph: PendingAnimationGraphSnapshot | null;
    sourceOverrides: Record<string, string>;
    dump: AnimGraphVariantDump;
}

interface PendingAnimationGraphSnapshot {
    uuid: string;
    source: string;
    sourceMtimeMs: number | null;
    assetDbMtime: number | null;
}

type AssetCtor = new () => any;

class AnimationGraphVariantAssetService {
    private _pendingEdits = new Map<string, PendingAnimationGraphVariantEdit>();

    async query(uuid: string): Promise<AnimGraphVariantDump> {
        const asset = this._queryTypedAsset(uuid, 'animation-graph-variant', 'cc.animation.AnimationGraphVariant');
        const variant = await this._loadAnimationGraphVariant(asset);
        const sourceOverrides = this._entryOverrides(variant);
        const dump = await this._encodeVariant(variant, sourceOverrides);
        const graph = await this._snapshotGraph(dump.graphUuid);

        this._pendingEdits.set(asset.uuid, {
            uuid: asset.uuid,
            source: asset.source,
            sourceMtimeMs: await this._querySourceMtime(asset.source),
            assetDbMtime: assetQuery.queryAssetMtime(asset.uuid),
            graph,
            sourceOverrides,
            dump: this._cloneDump(dump),
        });

        return dump;
    }

    async change(uuid: string, dump: AnimGraphVariantDump): Promise<AnimGraphVariantDump> {
        const asset = this._queryTypedAsset(uuid, 'animation-graph-variant', 'cc.animation.AnimationGraphVariant');
        let pending = this._pendingEdits.get(asset.uuid);

        if (!pending) {
            await this.query(asset.uuid);
            pending = this._pendingEdits.get(asset.uuid);
        }

        if (!pending) {
            throw new Error(`AnimationGraphVariant pending edit is missing: ${asset.uuid}`);
        }

        this._assertSourceUnchanged(asset, pending, await this._querySourceMtime(asset.source));

        const currentDump = this._cloneDump(pending.dump);
        const graphChanged = dump.graphUuid !== currentDump.graphUuid;
        if (!graphChanged) {
            await this._assertGraphUnchanged(pending.graph);
        }
        const nextDump = await this._applyChange(currentDump, dump, pending.sourceOverrides);
        const graph = graphChanged ? await this._snapshotGraph(nextDump.graphUuid) : pending.graph;

        this._pendingEdits.set(asset.uuid, {
            ...pending,
            graph,
            dump: this._cloneDump(nextDump),
        });

        return nextDump;
    }

    async save(uuid: string): Promise<void> {
        const asset = this._queryTypedAsset(uuid, 'animation-graph-variant', 'cc.animation.AnimationGraphVariant');
        const pending = this._pendingEdits.get(asset.uuid);

        if (!pending) {
            throw new Error(`AnimationGraphVariant pending edit is missing. Call query/change before save: ${asset.uuid}`);
        }

        this._assertSourceUnchanged(asset, pending, await this._querySourceMtime(asset.source));
        await this._assertGraphUnchanged(pending.graph);

        const ccAny = getCC();
        const { AnimationGraph } = getNewGenAnim();
        const variant = await this._loadAnimationGraphVariant(asset);
        const dump = this._cloneDump(pending.dump);

        if (dump.graphUuid) {
            this._queryTypedAsset(dump.graphUuid, 'animation-graph', 'cc.animation.AnimationGraph');
            variant.original = this._createAssetReference(dump.graphUuid, AnimationGraph as AssetCtor);
        } else {
            variant.original = null;
        }

        variant.clipOverrides.clear();
        for (const [originalUuid, substituteUuid] of Object.entries(dump.clips)) {
            if (!substituteUuid) {
                continue;
            }

            this._queryTypedAsset(originalUuid, 'animation-clip', 'cc.AnimationClip');
            this._queryTypedAsset(substituteUuid, 'animation-clip', 'cc.AnimationClip');
            const originalClip = this._createAssetReference(originalUuid, ccAny.AnimationClip as AssetCtor);
            const substituteClip = this._createAssetReference(substituteUuid, ccAny.AnimationClip as AssetCtor);
            variant.clipOverrides.set(originalClip, substituteClip);
        }

        const serialized = EditorExtends.serialize(variant);
        const content = typeof serialized === 'string'
            ? serialized
            : JSON.stringify(serialized, null, 2);

        await assetOperation.saveAsset(asset.uuid, content);
        this._pendingEdits.delete(asset.uuid);
    }

    private async _applyChange(
        currentDump: AnimGraphVariantDump,
        patch: AnimGraphVariantDump,
        sourceOverrides: Record<string, string>,
    ): Promise<AnimGraphVariantDump> {
        if (patch.graphUuid !== currentDump.graphUuid) {
            const graph = patch.graphUuid
                ? await this._loadAnimationGraphByUuid(patch.graphUuid)
                : null;
            return this._resetDump(patch.graphUuid, graph, sourceOverrides);
        }

        const clips = { ...currentDump.clips };
        for (const [originalUuid, substituteUuid] of Object.entries(patch.clips || {})) {
            clips[originalUuid] = substituteUuid;
        }

        return {
            graphUuid: currentDump.graphUuid,
            clips,
            invalids: { ...(currentDump.invalids || {}) },
        };
    }

    private async _encodeVariant(
        variant: any,
        sourceOverrides: Record<string, string>,
    ): Promise<AnimGraphVariantDump> {
        const graphUuid = this._queryAssetUuid(variant.original);
        const graph = graphUuid ? await this._loadAnimationGraphByUuid(graphUuid) : null;
        return this._resetDump(graphUuid, graph, sourceOverrides);
    }

    private _resetDump(
        graphUuid: string | null,
        graph: any | null,
        existingOverrides: Record<string, string>,
    ): AnimGraphVariantDump {
        const clips: Record<string, string> = {};
        const invalids: Record<string, string> = {};

        if (graph) {
            const { visitAnimationClips } = getNewGenAnim();
            for (const clip of visitAnimationClips(graph)) {
                const clipUuid = this._queryAssetUuid(clip);
                if (clipUuid) {
                    clips[clipUuid] = '';
                }
            }
        }

        for (const [originalUuid, substituteUuid] of Object.entries(existingOverrides)) {
            if (clips[originalUuid] === undefined) {
                invalids[originalUuid] = substituteUuid;
            } else {
                clips[originalUuid] = substituteUuid;
            }
        }

        return {
            graphUuid,
            clips,
            invalids,
        };
    }

    private _entryOverrides(variant: any): Record<string, string> {
        const overrides: Record<string, string> = {};

        for (const entry of variant.clipOverrides) {
            const originalUuid = this._queryAssetUuid(entry.original);
            const substituteUuid = this._queryAssetUuid(entry.substitution);
            if (originalUuid && substituteUuid) {
                overrides[originalUuid] = substituteUuid;
            }
        }

        return overrides;
    }

    private async _loadAnimationGraphVariant(asset: IAsset): Promise<any> {
        const json = await this._readSerializedAsset(asset);
        const variant = this._deserializeWithAssetPlaceholders<any>(json);
        const { AnimationGraphVariant } = getNewGenAnim();
        if (!(variant instanceof AnimationGraphVariant)) {
            throw new Error(`Asset is not an AnimationGraphVariant: ${asset.uuid}`);
        }
        return variant;
    }

    private async _loadAnimationGraphByUuid(uuid: string): Promise<any> {
        const asset = this._queryTypedAsset(uuid, 'animation-graph', 'cc.animation.AnimationGraph');
        const json = await this._readSerializedAsset(asset);
        const graph = this._deserializeWithAssetPlaceholders<any>(json);
        const { AnimationGraph } = getNewGenAnim();
        if (!(graph instanceof AnimationGraph)) {
            throw new Error(`Asset is not an AnimationGraph: ${uuid}`);
        }
        return graph;
    }

    private async _readSerializedAsset(asset: IAsset): Promise<unknown> {
        const content = await readFile(asset.source, 'utf8');
        try {
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Invalid JSON in asset ${asset.uuid}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private _deserializeWithAssetPlaceholders<T>(serialized: unknown): T {
        const deserialize = getCC().deserialize;
        const details = new deserialize.Details();
        details.reset();
        const object = deserialize(serialized, details) as T;
        details.assignAssetsBy((uuid: string, options?: { type?: Function }) => (
            this._createAssetReference(uuid, options?.type as AssetCtor | undefined)
        ));
        return object;
    }

    private _queryTypedAsset(uuidOrUrlOrPath: string, importer: string, type: string): IAsset {
        const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
        if (!asset) {
            throw new Error(`Can not find asset: ${uuidOrUrlOrPath}`);
        }

        const assetImporter = asset.meta?.importer;
        const assetType = (asset as any).type;
        if (assetImporter !== importer && assetType !== type) {
            throw new Error(`Expected ${type} asset, got importer ${assetImporter || 'unknown'} type ${assetType || 'unknown'}: ${uuidOrUrlOrPath}`);
        }

        return asset;
    }

    private _queryAssetUuid(asset: any | null | undefined): string | null {
        if (!asset) {
            return null;
        }

        const uuid = (asset as any)._uuid || (asset as any).uuid;
        return typeof uuid === 'string' && uuid ? uuid : null;
    }

    private _createAssetReference(uuid: string, type?: AssetCtor): any {
        if (!uuid) {
            throw new Error('Asset UUID is required');
        }
        const reference = EditorExtends.serialize.asAsset(uuid, type || getCC().Asset);
        if (!reference) {
            throw new Error(`Can not create asset reference: ${uuid}`);
        }
        return reference;
    }

    private async _querySourceMtime(source: string): Promise<number | null> {
        try {
            return (await stat(source)).mtimeMs;
        } catch {
            return null;
        }
    }

    private async _snapshotGraph(uuid: string | null): Promise<PendingAnimationGraphSnapshot | null> {
        if (!uuid) {
            return null;
        }

        const asset = this._queryTypedAsset(uuid, 'animation-graph', 'cc.animation.AnimationGraph');
        return {
            uuid: asset.uuid,
            source: asset.source,
            sourceMtimeMs: await this._querySourceMtime(asset.source),
            assetDbMtime: assetQuery.queryAssetMtime(asset.uuid),
        };
    }

    private _assertSourceUnchanged(asset: IAsset, pending: PendingAnimationGraphVariantEdit, currentSourceMtimeMs: number | null): void {
        const currentAssetDbMtime = assetQuery.queryAssetMtime(asset.uuid);
        if (
            pending.assetDbMtime !== null
            && currentAssetDbMtime !== null
            && pending.assetDbMtime !== currentAssetDbMtime
        ) {
            throw new Error(`AnimationGraphVariant source changed after query: ${asset.uuid}`);
        }

        if (
            pending.sourceMtimeMs !== null
            && currentSourceMtimeMs !== null
            && pending.sourceMtimeMs !== currentSourceMtimeMs
        ) {
            throw new Error(`AnimationGraphVariant source file changed after query: ${asset.source}`);
        }
    }

    private async _assertGraphUnchanged(graph: PendingAnimationGraphSnapshot | null): Promise<void> {
        if (!graph) {
            return;
        }

        const currentAssetDbMtime = assetQuery.queryAssetMtime(graph.uuid);
        if (
            graph.assetDbMtime !== null
            && currentAssetDbMtime !== null
            && graph.assetDbMtime !== currentAssetDbMtime
        ) {
            throw new Error(`AnimationGraph source changed after query: ${graph.uuid}`);
        }

        const currentSourceMtimeMs = await this._querySourceMtime(graph.source);
        if (
            graph.sourceMtimeMs !== null
            && currentSourceMtimeMs !== null
            && graph.sourceMtimeMs !== currentSourceMtimeMs
        ) {
            throw new Error(`AnimationGraph source file changed after query: ${graph.source}`);
        }
    }

    private _cloneDump(dump: AnimGraphVariantDump): AnimGraphVariantDump {
        return {
            graphUuid: dump.graphUuid,
            clips: { ...dump.clips },
            invalids: dump.invalids ? { ...dump.invalids } : undefined,
        };
    }
}

const animationGraphVariant = new AnimationGraphVariantAssetService();

export default animationGraphVariant;
