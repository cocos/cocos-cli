import { Archive } from '../utils/migration-utils';
import * as cc from 'cc';
import { ArchiveSpace } from './archive-space';

/**
 * Migrates `geometry.AnimationCurve`.
 */
export async function migrateGeometryCurve330(archive: Archive) {
    archive.visitTypedObject(
        ArchiveSpace.GEOMETRY_CURVE_TYPE_NAME,
        (oldGeometryCurve: ArchiveSpace.GeometryCurveMigration330.GeometryCurveBefore) => {
            const realCurve = convertGeometryCurveToRealCurve(archive, oldGeometryCurve);
            archive.clearObject(oldGeometryCurve);
            const newGeometryCurve = oldGeometryCurve as unknown as ArchiveSpace.GeometryCurveMigration330.GeometryCurveAfter;
            newGeometryCurve._curve = realCurve;
            return newGeometryCurve;
        },
    );

    function convertGeometryCurveToRealCurve(archive: Archive, geometryCurve: ArchiveSpace.GeometryCurveMigration330.GeometryCurveBefore) {
        const realCurve = archive.addTypedObject(ArchiveSpace.REAL_CURVE_TYPE_NAME) as unknown as ArchiveSpace.RealCurve;
        realCurve._times = geometryCurve.keyFrames.map((oldKeyframe) => oldKeyframe.time);
        realCurve._values = geometryCurve.keyFrames.map((oldKeyframe) => {
            const realKeyframeValue = archive.addTypedObject(
                ArchiveSpace.REAL_CURVE_KEYFRAME_VALUE_TYPE_NAME,
            ) as unknown as ArchiveSpace.RealCurveKeyframeValue;
            realKeyframeValue.interpolationMode = cc.RealInterpolationMode.CUBIC;
            realKeyframeValue.tangentWeightMode = ArchiveSpace.TangentWeightMode.NONE;
            realKeyframeValue.value = oldKeyframe.value;
            realKeyframeValue.leftTangent = oldKeyframe.inTangent;
            realKeyframeValue.rightTangent = oldKeyframe.outTangent;
            realKeyframeValue.rightTangentWeight = 0.0;
            realKeyframeValue.leftTangentWeight = 0.0;
            realKeyframeValue.easingMethod = 0;
            return realKeyframeValue;
        });
        realCurve.preExtrapolation = wrapModeToExtrapolationMode(geometryCurve.preWrapMode);
        realCurve.postExtrapolation = wrapModeToExtrapolationMode(geometryCurve.postWrapMode);
        return realCurve;
    }

    function wrapModeToExtrapolationMode(wrapMode: ArchiveSpace.GeometryCurveWrapMode): cc.ExtrapolationMode {
        switch (wrapMode) {
            default:
            case ArchiveSpace.GeometryCurveWrapMode.Default:
            case ArchiveSpace.GeometryCurveWrapMode.Normal:
            case ArchiveSpace.GeometryCurveWrapMode.Clamp:
                return cc.ExtrapolationMode.CLAMP;
            case ArchiveSpace.GeometryCurveWrapMode.PingPong:
                return cc.ExtrapolationMode.PING_PONG;
            case ArchiveSpace.GeometryCurveWrapMode.Loop:
                return cc.ExtrapolationMode.LOOP;
        }
    }
}
