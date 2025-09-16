import { gfx, Mesh, Morph, utils, Vec3 } from 'cc';
import { SimplifyOptions } from '../../meta-schemas/glTF.meta';
import { getDefaultSimplifyOptions, MeshSimplify } from './meshSimplify';

export function mergeMeshes(meshes: Mesh[] = []): Mesh {
    if (meshes.length === 0) {
        // create a empty mesh
        console.warn('mergeMeshes: meshes is empty');
        return new Mesh();
    }

    if (meshes.length === 1) {
        return meshes[0];
    }

    if (meshes.every((mesh) => mesh.struct.compressed)) {
        return new Mesh();
    }

    const validate_morph = (meshes: Mesh[]): boolean => {
        const morphs = meshes.map((mesh) => mesh.struct.morph);
        if (morphs.every((morph) => morph === undefined)) {
            // if all undefined, exit immediately
            return true;
        }

        return false;
    };

    const validate_compress = (meshes: Mesh[]): boolean => {
        const encodeds = meshes.map((mesh) => mesh.struct.encoded);
        const compresses = meshes.map((mesh) => mesh.struct.compressed);
        const quantizeds = meshes.map((mesh) => mesh.struct.quantized);

        if (
            encodeds.every((encoded) => encoded === undefined) &&
            compresses.every((compress) => compress === undefined) &&
            quantizeds.every((quantized) => quantized === undefined)
        ) {
            // if all undefined, exit immediately
            return true;
        }

        const firstEncoded = encodeds[0]!;
        for (let i = 1; i < encodeds.length; i++) {
            if (encodeds[i] !== firstEncoded) {
                return false;
            }
        }

        const firstCompress = compresses[0]!;
        for (let i = 1; i < compresses.length; i++) {
            if (compresses[i] !== firstCompress) {
                return false;
            }
        }

        const firstQuantized = quantizeds[0]!;
        for (let i = 1; i < quantizeds.length; i++) {
            if (quantizeds[i] !== firstQuantized) {
                return false;
            }
        }

        return true;
    };

    // validate joint map[][], joint map should be the same
    const validata_jointMap = (meshes: Mesh[]): boolean => {
        const jointMaps = meshes.map((mesh) => mesh.struct.jointMaps);
        // no joint map, or all joint map are the same
        if (jointMaps.every((jointMap) => jointMap === undefined)) {
            return true;
        }

        // all should be the same, data
        const firstJointMap = jointMaps[0]!;
        const xdim = firstJointMap.length;
        for (let i = 1; i < jointMaps.length; i++) {
            const jointMap = jointMaps[i]!;
            if (jointMap.length !== xdim) {
                return false;
            }

            for (let j = 0; j < jointMap.length; j++) {
                const ydim = firstJointMap[j].length;
                if (jointMap[j].length !== ydim) {
                    return false;
                }

                for (let k = 0; k < ydim; k++) {
                    if (jointMap[j][k] !== firstJointMap[j][k]) {
                        return false;
                    }
                }
            }
        }

        return true;
    };

    if (!validate_compress(meshes)) {
        console.warn('mergeMeshes: encoded state is not the same');
        return new Mesh();
    }

    if (!validata_jointMap(meshes)) {
        console.warn('mergeMeshes: jointMap is not the same');
        return new Mesh();
    }

    if (!validate_morph(meshes)) {
        console.warn('mergeMeshes: morph is not supported');
        return new Mesh();
    }

    const bufferSize = meshes.reduce((acc, cur) => {
        return acc + cur.data.byteLength;
    }, 0);

    const data = new Uint8Array(bufferSize);
    const vertexBundles = [];
    const primitives = [];

    let data_offset = 0;
    let bundle_offset = 0;

    const minPosition = meshes[0].struct.minPosition || new Vec3(1e9);
    const maxPosition = meshes[0].struct.maxPosition || new Vec3(-1e9);

    for (let i = 0; i < meshes.length; i++) {
        // copy data from mesh.data to data at offset
        const mesh = meshes[i];
        const meshData = mesh.data;

        // append data to the end of the buffer
        data.set(meshData, data_offset);

        // copy the vertex bundles
        vertexBundles.push(
            ...mesh.struct.vertexBundles.map((bundle) => {
                const newBundle = bundle;
                newBundle.view.offset += data_offset;
                return newBundle;
            }),
        );

        // copy the primitives, and apply the offset to view
        primitives.push(
            ...mesh.struct.primitives.map((primitive) => {
                const newPrimitive = primitive;
                newPrimitive.vertexBundelIndices = primitive.vertexBundelIndices.map((index) => index + bundle_offset);
                if (newPrimitive.indexView) {
                    newPrimitive.indexView.offset += data_offset;
                }
                return newPrimitive;
            }),
        );

        data_offset += meshData.byteLength;
        bundle_offset += mesh.struct.vertexBundles.length;

        minPosition.x = Math.min(minPosition.x, mesh.struct.minPosition?.x || 1e9);
        minPosition.y = Math.min(minPosition.y, mesh.struct.minPosition?.y || 1e9);
        minPosition.z = Math.min(minPosition.z, mesh.struct.minPosition?.z || 1e9);

        maxPosition.x = Math.max(maxPosition.x, mesh.struct.maxPosition?.x || -1e9);
        maxPosition.y = Math.max(maxPosition.y, mesh.struct.maxPosition?.y || -1e9);
        maxPosition.z = Math.max(maxPosition.z, mesh.struct.maxPosition?.z || -1e9);
    }

    // TODO: morph and skinning, joints, dynamic, etc.
    const meshCreateInfo: Mesh.ICreateInfo = {
        struct: {
            vertexBundles,
            primitives,
            minPosition,
            maxPosition,
            jointMaps: meshes[0].struct.jointMaps,
            dynamic: meshes[0].struct.dynamic,
            compressed: meshes[0].struct.compressed,
            quantized: meshes[0].struct.quantized,
            encoded: meshes[0].struct.encoded,
        },
        data: data,
    };

    const out = new Mesh();
    out.reset(meshCreateInfo);
    out.hash;
    return out;
}
