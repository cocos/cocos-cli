import { Archive } from '../utils/migration-utils';
import { ArchiveSpace } from './archive-space';

/**
 * Migrates:
 * - curve: AnimationCurve -> value: RealCurve
 * - rangeMin: AnimationCurve -> min: RealCurve
 * - rangeMax: AnimationCurve -> max: RealCurve
 */
export async function migrateCurveRange330(archive: Archive) {
    archive.visitTypedObject(
        ArchiveSpace.CURVE_RANGE_TYPE_NAME,
        (oldSerializedCurveRange: ArchiveSpace.CurveRangeMigration330.CurveRangeBefore) => {
            const newSerializedCurveRange = oldSerializedCurveRange as unknown as ArchiveSpace.CurveRangeMigration330.CurveRangeAfter;

            const convertProperty = (
                oldPropertyName: 'curve' | 'curveMin' | 'curveMax',
                newPropertyName: 'spline' | 'splineMin' | 'splineMax',
            ) => {
                const geometryCurve = oldSerializedCurveRange[oldPropertyName];
                if (geometryCurve !== undefined) {
                    newSerializedCurveRange[newPropertyName] = geometryCurve._curve;
                    delete oldSerializedCurveRange[oldPropertyName];
                }
            };

            convertProperty('curve', 'spline');
            convertProperty('curveMin', 'splineMin');
            convertProperty('curveMax', 'splineMax');
        },
    );
}
