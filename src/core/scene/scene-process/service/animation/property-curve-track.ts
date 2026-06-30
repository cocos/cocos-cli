import { AnimationClip, animation } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationPropertyType,
    IAnimationValue,
} from '../../../common';
import type {
    AnyCurve,
    AnyTrack,
    IPropertyTrackDescriptor,
    PropertyKind,
} from './property-curve-types';

const VECTOR_COMPONENTS = ['x', 'y', 'z'] as const;
const VECTOR4_COMPONENTS = ['x', 'y', 'z', 'w'] as const;
const COLOR_COMPONENTS = ['r', 'g', 'b', 'a'] as const;
const SIZE_COMPONENTS = ['width', 'height'] as const;

const NODE_PROPERTY_DESCRIPTORS: Record<string, Omit<IPropertyTrackDescriptor, 'propKey' | 'propName'>> = {
    position: {
        kind: 'vector',
        displayName: 'position',
        menuName: 'position',
        type: { value: 'cc.Vec3' },
        isCurveSupport: true,
        partKeys: VECTOR_COMPONENTS,
    },
    scale: {
        kind: 'vector',
        displayName: 'scale',
        menuName: 'scale',
        type: { value: 'cc.Vec3' },
        isCurveSupport: true,
        partKeys: VECTOR_COMPONENTS,
    },
    eulerAngles: {
        kind: 'vector',
        displayName: 'rotation(eulerAngles)',
        menuName: 'rotation(eulerAngles)',
        type: { value: 'cc.Vec3' },
        isCurveSupport: true,
        partKeys: VECTOR_COMPONENTS,
    },
    rotation: {
        kind: 'quat',
        displayName: 'rotation(quaternion)',
        menuName: 'rotation(quaternion)',
        type: { value: 'cc.Quat' },
        isCurveSupport: false,
    },
    active: {
        kind: 'object',
        displayName: 'active',
        menuName: 'active',
        type: { value: 'cc.Boolean' },
        isCurveSupport: false,
    },
};

export function findPropertyTrack(clip: AnimationClip, nodePath: string, propKey: string): AnyTrack | null {
    for (const track of getClipTracks(clip)) {
        const target = parsePropertyTrack(track);
        if (target?.nodePath === nodePath && target.descriptor.propKey === propKey) {
            return track;
        }
    }
    return null;
}

export function createPropertyTrack(clip: AnimationClip, nodePath: string, descriptor: IPropertyTrackDescriptor): AnyTrack {
    const track = createTrackByKind(descriptor);
    const path = new animation.TrackPath();
    if (nodePath) {
        path.toHierarchy(nodePath);
    }
    if (descriptor.comp) {
        path.toComponent(descriptor.comp);
    }
    path.toProperty(descriptor.propName);
    track.path = path;
    ensureClipTrackArray(clip);
    clip.addTrack(track);
    return track;
}

export function parsePropertyTrack(track: unknown): { nodePath: string; descriptor: IPropertyTrackDescriptor } | null {
    const kind = queryTrackKind(track);
    if (!kind) {
        return null;
    }

    const path = (track as AnyTrack).path;
    let index = 0;
    let nodePath = '';
    while (index < path.length && path.isHierarchyAt(index)) {
        const segment = normalizePath(path.parseHierarchyAt(index));
        if (segment) {
            nodePath = nodePath ? `${nodePath}/${segment}` : segment;
        }
        index++;
    }

    let comp: string | undefined;
    if (index < path.length && path.isComponentAt(index)) {
        comp = path.parseComponentAt(index);
        index++;
    }

    if (index !== path.length - 1 || !path.isPropertyAt(index)) {
        return null;
    }

    const propName = path.parsePropertyAt(index);
    const propKey = comp ? `${comp}.${propName}` : propName;
    const descriptor = createPropertyDescriptor(propKey, undefined, kind, track as AnyTrack);
    return descriptor ? { nodePath, descriptor } : null;
}

export function createPropertyDescriptor(propKey: string, value?: IAnimationValue, trackKind?: PropertyKind, track?: AnyTrack): IPropertyTrackDescriptor | null {
    const propertyKey = String(propKey || '');
    const known = NODE_PROPERTY_DESCRIPTORS[propertyKey];
    if (known) {
        return {
            ...known,
            propKey: propertyKey,
            propName: propertyKey,
        };
    }

    const componentProperty = splitComponentPropertyKey(propertyKey);
    const propName = componentProperty?.propName || propertyKey;
    const comp = componentProperty?.comp;
    const kind = trackKind || inferPropertyKind(value);
    if (!kind) {
        return null;
    }

    const partKeys = queryPartKeys(kind, value, track);
    return {
        propKey: propertyKey,
        propName,
        comp,
        kind,
        type: queryPropertyType(kind, value, partKeys),
        displayName: propertyKey,
        menuName: propertyKey,
        isCurveSupport: kind !== 'object' && kind !== 'quat',
        partKeys,
    };
}

export function createPropertyDescriptorFromDump(curve: IAnimationCurveDump): IPropertyTrackDescriptor | null {
    const keyframes = Array.isArray(curve.keyframes) ? curve.keyframes : [];
    const firstValue = keyframes[0]?.dump.value;
    const type = curve.type?.value;
    const kind = type ? inferPropertyKindFromType(type) : undefined;
    const descriptor = createPropertyDescriptor(curve.key, firstValue, kind);
    if (!descriptor) {
        return null;
    }
    if (curve.type) {
        descriptor.type = curve.type;
    }
    if (Array.isArray(curve.partKeys) && curve.partKeys.length > 0) {
        descriptor.partKeys = curve.partKeys;
    }
    if (curve.comp) {
        descriptor.comp = curve.comp;
    }
    return descriptor;
}

export function removeSupportedPropertyTracks(clip: AnimationClip): void {
    const tracks = getClipTracks(clip);
    for (let index = tracks.length - 1; index >= 0; index--) {
        if (parsePropertyTrack(clip.getTrack(index))) {
            clip.removeTrack(index);
        }
    }
}

export function removeTrackIfEmpty(clip: AnimationClip, track: AnyTrack): void {
    if (queryTrackChannels(track).some((channel) => (channel.curve as any).keyFramesCount > 0)) {
        return;
    }

    const tracks = getClipTracks(clip);
    for (let index = tracks.length - 1; index >= 0; index--) {
        if (clip.getTrack(index) === track) {
            clip.removeTrack(index);
            return;
        }
    }
}

export function applyTrackExtrapolation(track: AnyTrack, preExtrap?: number, postExtrap?: number): void {
    for (const channel of queryTrackChannels(track)) {
        const curve = channel.curve as any;
        if ('preExtrapolation' in curve) {
            curve.preExtrapolation = Number(preExtrap) || 0;
        }
        if ('postExtrapolation' in curve) {
            curve.postExtrapolation = Number(postExtrap) || 0;
        }
    }
}

export function queryFirstRealCurve(track: AnyTrack): any | null {
    const curve = queryTrackChannels(track)[0]?.curve as any;
    return curve && 'preExtrapolation' in curve ? curve : null;
}

export function queryTrackChannels(track: AnyTrack): Array<{ curve: AnyCurve }> {
    return Array.from(track.channels() || []) as Array<{ curve: AnyCurve }>;
}

export function getClipTracks(clip: AnimationClip): AnyTrack[] {
    return ensureClipTrackArray(clip);
}

export function normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
}

function createTrackByKind(descriptor: IPropertyTrackDescriptor): AnyTrack {
    switch (descriptor.kind) {
        case 'vector': {
            const track = new animation.VectorTrack();
            track.componentsCount = descriptor.partKeys?.length || 3;
            return track as AnyTrack;
        }
        case 'real':
            return new animation.RealTrack() as AnyTrack;
        case 'quat':
            return new animation.QuatTrack() as AnyTrack;
        case 'color':
            return new animation.ColorTrack() as AnyTrack;
        case 'size':
            return new animation.SizeTrack() as AnyTrack;
        case 'object':
            return new animation.ObjectTrack<IAnimationValue>() as AnyTrack;
        default:
            throw new Error(`Unsupported animation property track kind: ${String(descriptor.kind)}`);
    }
}

function ensureClipTrackArray(clip: AnimationClip): AnyTrack[] {
    const clipAny = clip as any;
    if (!Array.isArray(clipAny._tracks)) {
        clipAny._tracks = [];
    }
    return clipAny._tracks as AnyTrack[];
}

function queryTrackKind(track: unknown): PropertyKind | null {
    if (track instanceof animation.VectorTrack) {
        return 'vector';
    }
    if (track instanceof animation.RealTrack) {
        return 'real';
    }
    if (track instanceof animation.QuatTrack) {
        return 'quat';
    }
    if (track instanceof animation.ColorTrack) {
        return 'color';
    }
    if (track instanceof animation.SizeTrack) {
        return 'size';
    }
    if (track instanceof animation.ObjectTrack) {
        return 'object';
    }
    return null;
}

function splitComponentPropertyKey(propKey: string): { comp: string; propName: string } | null {
    const index = propKey.lastIndexOf('.');
    if (index <= 0 || index === propKey.length - 1) {
        return null;
    }
    return {
        comp: propKey.slice(0, index),
        propName: propKey.slice(index + 1),
    };
}

function inferPropertyKind(value: IAnimationValue | undefined): PropertyKind | null {
    if (typeof value === 'number') {
        return 'real';
    }
    if (typeof value === 'boolean' || typeof value === 'string' || value === null) {
        return 'object';
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    if (hasNumericFields(value, COLOR_COMPONENTS)) {
        return 'color';
    }
    if (hasNumericFields(value, SIZE_COMPONENTS)) {
        return 'size';
    }
    if (hasNumericFields(value, VECTOR4_COMPONENTS)) {
        return 'vector';
    }
    if (hasNumericFields(value, VECTOR_COMPONENTS) || hasNumericFields(value, ['x', 'y'])) {
        return 'vector';
    }
    return 'object';
}

function inferPropertyKindFromType(type: string): PropertyKind | undefined {
    switch (type) {
        case 'cc.Number':
        case 'number':
        case 'Number':
            return 'real';
        case 'cc.Quat':
            return 'quat';
        case 'cc.Color':
            return 'color';
        case 'cc.Size':
            return 'size';
        case 'cc.Vec2':
        case 'cc.Vec3':
        case 'cc.Vec4':
            return 'vector';
        case 'cc.Boolean':
        case 'Boolean':
        case 'cc.String':
        case 'String':
            return 'object';
        default:
            return undefined;
    }
}

function queryPartKeys(kind: PropertyKind, value?: IAnimationValue, track?: AnyTrack): readonly string[] | undefined {
    if (kind === 'color') {
        return COLOR_COMPONENTS;
    }
    if (kind === 'size') {
        return SIZE_COMPONENTS;
    }
    if (kind !== 'vector') {
        return undefined;
    }
    if (track instanceof animation.VectorTrack) {
        return VECTOR4_COMPONENTS.slice(0, track.componentsCount);
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && hasNumericFields(value, VECTOR4_COMPONENTS)) {
        return VECTOR4_COMPONENTS;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && hasNumericFields(value, ['x', 'y']) && !hasNumericFields(value, VECTOR_COMPONENTS)) {
        return ['x', 'y'];
    }
    return VECTOR_COMPONENTS;
}

function queryPropertyType(kind: PropertyKind, value?: IAnimationValue, partKeys?: readonly string[]): IAnimationPropertyType {
    switch (kind) {
        case 'real':
            return { value: 'cc.Number' };
        case 'quat':
            return { value: 'cc.Quat' };
        case 'color':
            return { value: 'cc.Color' };
        case 'size':
            return { value: 'cc.Size' };
        case 'vector':
            return { value: `cc.Vec${partKeys?.length || 3}` };
        case 'object':
            return { value: queryObjectValueType(value) };
        default:
            return { value: 'cc.Object' };
    }
}

function queryObjectValueType(value: IAnimationValue | undefined): string {
    if (typeof value === 'boolean') {
        return 'cc.Boolean';
    }
    if (typeof value === 'string') {
        return 'cc.String';
    }
    if (typeof value === 'number') {
        return 'cc.Number';
    }
    return 'cc.Object';
}

function hasNumericFields(value: object, fields: readonly string[]): boolean {
    return fields.every((field) => Number.isFinite(Number((value as any)[field])));
}
