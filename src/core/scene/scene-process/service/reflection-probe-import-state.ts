const TEXTURE_CUBE_FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'];

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isReflectionProbeTextureCubeImported(
    value: unknown,
    expectedMipBakeMode: number,
): boolean {
    if (!isRecord(value) || value.imported !== true) {
        return false;
    }

    const textureCube = value.subMetas?.b47c0;
    if (!isRecord(textureCube)
        || textureCube.imported !== true
        || textureCube.userData?.mipBakeMode !== expectedMipBakeMode
        || !isRecord(textureCube.subMetas)) {
        return false;
    }

    const importedFaces = new Set<string>();
    for (const face of Object.values(textureCube.subMetas)) {
        if (isRecord(face)
            && face.imported === true
            && typeof face.uuid === 'string'
            && typeof face.name === 'string') {
            importedFaces.add(face.name);
        }
    }
    return TEXTURE_CUBE_FACE_NAMES.every((name) => importedFaces.has(name));
}
