import type * as cc from 'cc';

namespace ArchiveSpace {
    type ArchiveArray<T> = T[];

    type ArchiveTypedObject<T> = T;

    export interface RealCurve {
        _times: ArchiveArray<number>;
        _values: ArchiveArray<RealCurveKeyframeValue>;
        preExtrapolation: cc.ExtrapolationMode;
        postExtrapolation: cc.ExtrapolationMode;
    }

    export interface RealCurveKeyframeValue {
        value?: number;
        interpolationMode?: cc.RealInterpolationMode;
        tangentWeightMode: TangentWeightMode;
        rightTangent: number;
        leftTangent: number;
        rightTangentWeight: number;
        leftTangentWeight: number;
        easingMethod: number;
    }

    export enum TangentWeightMode {
        NONE = 0,
        LEFT = 1,
        RIGHT = 2,
        BOTH = 1 | 2,
    }

    export enum GeometryCurveWrapMode {
        Default = 0,
        Normal = 1 << 0,
        Clamp = 1 << 3,
        Loop = 1 << 1,
        PingPong = (1 << 4) | (1 << 1) | (1 << 2),
    }

    // eslint-disable-next-line
    export interface CompactValueTypeArray {}

    export declare namespace GeometryCurveMigration330 {
        export interface GeometryCurveBefore {
            preWrapMode: GeometryCurveWrapMode;
            postWrapMode: GeometryCurveWrapMode;
            keyFrames: cc.geometry.Keyframe[];
        }

        export interface GeometryCurveAfter {
            _curve: RealCurve;
        }
    }

    export namespace CurveRangeMigration330 {
        export interface CurveRangeBefore {
            curve?: GeometryCurveMigration330.GeometryCurveAfter;
            curveMin?: GeometryCurveMigration330.GeometryCurveAfter;
            curveMax?: GeometryCurveMigration330.GeometryCurveAfter;
        }

        export interface CurveRangeAfter {
            spline?: RealCurve;
            splineMin?: RealCurve;
            splineMax?: RealCurve;
        }
    }

    export declare namespace AnimationClipMigration330 {
        export type LegacyMayBeCompressedCompactKeys = number[] | CompactValueTypeArray;

        export type LegacyMaybeCompactCurve = Omit<cc.AnimationClip._legacy.LegacyClipCurve, 'data'> & {
            data: Omit<cc.AnimationClip._legacy.LegacyClipCurveData, 'values'> & {
                values: any[] | CompactValueTypeArray;
            };
        };

        export interface AnimationClipBefore {
            duration?: number;
            _keys?: LegacyMayBeCompressedCompactKeys[];
            _curves?: LegacyMaybeCompactCurve[];
            _commonTargets?: cc.AnimationClip._legacy.LegacyCommonTarget[];
            _stepness?: boolean;
            events?: unknown[];
        }

        export interface AnimationClipNew {
            _tracks: unknown[];
            _events?: unknown[];
            _exoticAnimation: null;
        }
    }

    export const GEOMETRY_CURVE_TYPE_NAME = 'cc.AnimationCurve';

    export const REAL_CURVE_TYPE_NAME = 'cc.RealCurve';

    export const REAL_CURVE_KEYFRAME_VALUE_TYPE_NAME = 'cc.RealKeyframeValue';

    export const CURVE_RANGE_TYPE_NAME = 'cc.CurveRange';

    export const ANIMATION_CLIP_TYPE_NAME = 'cc.AnimationClip';

    export const COMPACT_VALUE_TYPE_ARRAY_TYPE_NAME = 'cc.CompactValueTypeArray';
}

export { ArchiveSpace };
