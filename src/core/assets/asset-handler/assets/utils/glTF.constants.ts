export enum GltfAccessorComponentType {
    BYTE = 5120,
    UNSIGNED_BYTE = 5121,
    SHORT = 5122,
    UNSIGNED_SHORT = 5123,
    UNSIGNED_INT = 5125,
    FLOAT = 5126,
}

export enum GltfAccessorType {
    SCALAR = 'SCALAR',
    VEC2 = 'VEC2',
    VEC3 = 'VEC3',
    VEC4 = 'VEC4',
    MAT2 = 'MAT2',
    MAT3 = 'MAT3',
    MAT4 = 'MAT4',
}

export function getGltfAccessorTypeComponents(type: string) {
    switch (type) {
        case GltfAccessorType.SCALAR:
            return 1;
        case GltfAccessorType.VEC2:
            return 2;
        case GltfAccessorType.VEC3:
            return 3;
        case GltfAccessorType.VEC4:
        case GltfAccessorType.MAT2:
            return 4;
        case GltfAccessorType.MAT3:
            return 9;
        case GltfAccessorType.MAT4:
            return 16;
        default:
            throw new Error(`Unrecognized attribute type: ${type}.`);
    }
}

export enum GltfPrimitiveMode {
    POINTS = 0,
    LINES = 1,
    LINE_LOOP = 2,
    LINE_STRIP = 3,
    TRIANGLES = 4,
    TRIANGLE_STRIP = 5,
    TRIANGLE_FAN = 6,
    __DEFAULT = 4,
}

export enum GltfTextureMagFilter {
    NEAREST = 9728,
    LINEAR = 9729,
}

export enum GltfTextureMinFilter {
    NEAREST = 9728,
    LINEAR = 9729,
    NEAREST_MIPMAP_NEAREST = 9984,
    LINEAR_MIPMAP_NEAREST = 9985,
    NEAREST_MIPMAP_LINEAR = 9986,
    LINEAR_MIPMAP_LINEAR = 9987,
}

export enum GltfWrapMode {
    CLAMP_TO_EDGE = 33071,
    MIRRORED_REPEAT = 33648,
    REPEAT = 10497,
    __DEFAULT = 10497,
}

export enum GltfAnimationChannelTargetPath {
    translation = 'translation',
    rotation = 'rotation',
    scale = 'scale',
    weights = 'weights',
}

export enum GlTfAnimationInterpolation {
    STEP = 'STEP',
    LINEAR = 'LINEAR',
    CUBIC_SPLINE = 'CUBICSPLINE',
}
