import type { animation } from 'cc';
import type {
    IAnimationCurveKeyData,
    IAnimationPropertyType,
    IAnimationValue,
} from '../../../common';

export type PropertyKind = 'real' | 'vector' | 'quat' | 'color' | 'size' | 'object';
export type AnyTrack = InstanceType<typeof animation.Track>;
export type AnyCurve = ReturnType<AnyTrack['channels']> extends Iterable<infer T> ? T extends { curve: infer C } ? C : never : never;

export interface IPropertyTarget {
    nodePath?: string;
    nodeUuid?: string;
    propKey: string;
}

export interface IPropertyTrackDescriptor {
    propKey: string;
    propName: string;
    comp?: string;
    kind: PropertyKind;
    type: IAnimationPropertyType;
    displayName: string;
    menuName: string;
    isCurveSupport: boolean;
    partKeys?: readonly string[];
}

export interface ICreatePropertyKeyOperation extends IPropertyTarget {
    frame: number;
    value: IAnimationValue;
    channel?: string;
    keyData?: IAnimationCurveKeyData;
}
