import { Archive } from '../utils/migration-utils';
import * as cc from 'cc';
import { ArchiveSpace } from './archive-space';
import { AnimationClipLegacyData } from 'cc/editor/animation-clip-migration';

@cc._decorator.ccclass('cc._internal.migrate-animation_clip-3-3-0.Helper')
class Helper {
    public static createFromSerializedLegacyClip(clip: ArchiveSpace.AnimationClipMigration330.AnimationClipBefore) {
        const arrayBuffer = new ArrayBuffer(0); // Should not happen to be honest.

        // Get serialized properties from clip.
        const duration = clip.duration ?? 0.0;
        const serializedKeys = (clip._keys ?? []).map((keys) => decodeMaybeCompactValueTypeArray(keys, arrayBuffer));
        const serializedCurves = clip._curves ?? [];
        serializedCurves.forEach((curve) => {
            decodeMaybeCompactValueTypeArray(curve.data.values, arrayBuffer);
        });
        const serializedCommonTargets = clip._commonTargets ?? [];

        // Constructs the serialized helper.
        const helperArchive = new Archive();
        const helperArchiveObject = helperArchive.addTypedObject(cc.js.getClassName(Helper)) as any;
        helperArchiveObject.duration = duration;
        helperArchiveObject._keys = serializedKeys;
        helperArchiveObject._curves = serializedCurves;
        helperArchiveObject._commonTargets = serializedCommonTargets;

        const details = cc.deserialize.Details.pool.get()!;

        // Deserialize the helper.
        const helperSerialized = helperArchive.get(helperArchiveObject);
        const helper = cc.deserialize(helperSerialized, details, undefined) as Helper;
        const nUUIDRefs = details.uuidList!.length;
        for (let i = 0; i < nUUIDRefs; ++i) {
            const uuid = details.uuidList![i];
            const uuidObj = details.uuidObjList![i] as any;
            const uuidProp = details.uuidPropList![i];
            const uuidType = details.uuidTypeList[i];
            const Type: new () => cc.Asset = (cc.js.getClassById(uuidType) as any) ?? cc.Asset;
            const asset = new Type();
            asset._uuid = uuid + '';
            uuidObj[uuidProp] = asset;
        }
        return helper;
    }

    @cc._decorator.property
    public duration = 0.0;

    @cc._decorator.property
    public _keys: AnimationClipLegacyData['keys'] = [];

    @cc._decorator.property
    public _curves: AnimationClipLegacyData['curves'] = [];

    @cc._decorator.property
    public _commonTargets: AnimationClipLegacyData['commonTargets'] = [];

    public toLegacyData() {
        const legacyData = new AnimationClipLegacyData(this.duration);
        legacyData.keys = this._keys;
        legacyData.curves = this._curves;
        legacyData.commonTargets = this._commonTargets;
        return legacyData;
    }
}

/**
 * Migrates `geometry.AnimationCurve`:
 * - Converts `_keys`, `_curves`, `_commonTargets` into `_tracks`.
 */
export async function migrateAnimationClip330(archive: Archive) {
    archive.visitTypedObject(
        ArchiveSpace.ANIMATION_CLIP_TYPE_NAME,
        (oldClip: ArchiveSpace.AnimationClipMigration330.AnimationClipBefore) => {
            const helper = Helper.createFromSerializedLegacyClip(oldClip);
            const legacyData = helper.toLegacyData();

            const events = oldClip.events;

            delete oldClip._keys;
            delete oldClip._curves;
            delete oldClip._commonTargets;
            delete oldClip._stepness;
            delete oldClip.events;

            const tracks = legacyData.toTracks();
            const tracksArchive = new Archive(EditorExtends.serialize(tracks, { stringify: false }));
            const newClip = oldClip as unknown as ArchiveSpace.AnimationClipMigration330.AnimationClipNew;
            newClip._tracks = tracksArchive.root as unknown[];
            newClip._events = events;
            newClip._exoticAnimation = null;
        },
    );
}

function decodeMaybeCompactValueTypeArray<T>(values: T[] | ArchiveSpace.CompactValueTypeArray, arrayBuffer: ArrayBuffer) {
    if (Array.isArray(values)) {
        return values;
    } else {
        const compactValueTypeArray = cc.deserialize(values, undefined, undefined) as cc.CompactValueTypeArray;
        return compactValueTypeArray.decompress(arrayBuffer) as T[];
    }
}
