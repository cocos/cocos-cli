import dracoglTF, { DecoderModule } from 'draco3dgltf';

// Reference: https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/DRACOLoader.js
// Reference: require('draco3dgltf')/draco_nodejs_example.js

export interface KHRDracoMeshCompression {
    bufferView: number;
    attributes: Record<string, number>;
}

export interface DecodedDracoGeometry {
    indices?: DecodedStorage;
    vertices: Record<string, DecodedStorage>;
}

export type DecodedStorage = Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Float32Array;

export type DecodedStorageConstructor =
    | Int8ArrayConstructor
    | Int16ArrayConstructor
    | Int32ArrayConstructor
    | Uint8ArrayConstructor
    | Uint16ArrayConstructor
    | Uint32ArrayConstructor
    | Float32ArrayConstructor;

export interface DecodeDracoGeometryOptions {
    buffer: Int8Array;
    indices?: DecodedStorageConstructor;
    attributes: Record<
        string,
        {
            /**
             * Unique id in the compressed data.
             */
            uniqueId: number;

            /**
             * Its associated accessor.
             */
            storageConstructor: DecodedStorageConstructor;

            /**
             * How many storage units one attribute occupies.
             */
            components: number;
        }
    >;
}

const decoderModule = dracoglTF.createDecoderModule({});

export function decodeDracoGeometry(options: DecodeDracoGeometryOptions) {
    const decoder = new decoderModule.Decoder();
    const decoded = decodeDracoData(options.buffer, decoder, options);
    decoderModule.destroy(decoder);
    return decoded;
}

function decodeDracoData(buffer: Int8Array, decoder: DecoderModule.Decoder, options: DecodeDracoGeometryOptions) {
    const decoderBuffer = new decoderModule.DecoderBuffer();
    decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
    const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
    let dracoGeometry: DecoderModule.Geometry;
    let decodingStatus: DecoderModule.Status;
    switch (geometryType) {
        case decoderModule.TRIANGULAR_MESH:
            dracoGeometry = new decoderModule.Mesh();
            decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry as DecoderModule.Mesh);
            break;
        case decoderModule.POINT_CLOUD:
            dracoGeometry = new decoderModule.PointCloud();
            decodingStatus = decoder.DecodeBufferToPointCloud(decoderBuffer, dracoGeometry);
            break;
        default:
            throw new Error(`Unknown geometry type ${geometryType}.`);
    }

    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
        throw new Error(`Decoding failed: ${decodingStatus.error_msg()}`);
    }

    const vertices = decodeAttributes(dracoGeometry, decoder, options);
    const decoded: DecodedDracoGeometry = {
        vertices,
    };
    if (geometryType === decoderModule.TRIANGULAR_MESH && options.indices) {
        const indices = decodeIndices(dracoGeometry as DecoderModule.Mesh, decoder, options.indices);
        decoded.indices = indices;
    }

    decoderModule.destroy(dracoGeometry);
    decoderModule.destroy(decoderBuffer);
    return decoded;
}

function decodeAttributes(dracoGeometry: DecoderModule.Geometry, decoder: DecoderModule.Decoder, options: DecodeDracoGeometryOptions) {
    const nVertices = dracoGeometry.num_points();
    const vertices: Record<string, DecodedStorage> = {};
    for (const attributeName of Object.keys(options.attributes)) {
        const {
            uniqueId,
            storageConstructor: attributeDataArrayConstructor,
            components: nComponentsPerAttribute,
        } = options.attributes[attributeName];
        const nValues = nComponentsPerAttribute * nVertices;

        const attribute = decoder.GetAttributeByUniqueId(dracoGeometry, uniqueId);
        const nActualComponentsPerAttribute = attribute.num_components();
        if (nActualComponentsPerAttribute !== nComponentsPerAttribute) {
            throw new Error(`Decompression error: components-per-attribute of ${attributeName} mismatch.`);
        }

        let attributeData:
            | DecoderModule.DracoInt8Array
            | DecoderModule.DracoInt16Array
            | DecoderModule.DracoInt32Array
            | DecoderModule.DracoUInt8Array
            | DecoderModule.DracoUInt16Array
            | DecoderModule.DracoUInt32Array
            | DecoderModule.DracoFloat32Array;
        switch (attributeDataArrayConstructor) {
            case Float32Array:
                attributeData = new decoderModule.DracoFloat32Array();
                decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Int8Array:
                attributeData = new decoderModule.DracoInt8Array();
                decoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Int16Array:
                attributeData = new decoderModule.DracoInt16Array();
                decoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Int32Array:
                attributeData = new decoderModule.DracoInt32Array();
                decoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Uint8Array:
                attributeData = new decoderModule.DracoUInt8Array();
                decoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Uint16Array:
                attributeData = new decoderModule.DracoUInt16Array();
                decoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case Uint32Array:
                attributeData = new decoderModule.DracoUInt32Array();
                decoder.GetAttributeUInt32ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            default:
                throw new Error('THREE.DRACOLoader: Unexpected attribute type.');
        }

        const attributeDataSize = attributeData.size();
        if (nValues !== attributeDataSize) {
            throw new Error(`Decompression error: ${attributeName} data size mismatch.`);
        }

        const attributeDataArray = new attributeDataArrayConstructor(nValues);
        for (let i = 0; i < nValues; ++i) {
            attributeDataArray[i] = attributeData.GetValue(i);
        }
        vertices[attributeName] = attributeDataArray;

        decoderModule.destroy(attributeData);
    }
    return vertices;
}

function decodeIndices(dracoMesh: DecoderModule.Mesh, decoder: DecoderModule.Decoder, indicesAccessor: DecodedStorageConstructor) {
    const nFaces = dracoMesh.num_faces();
    const nIndices = 3 * nFaces;
    const indicesConstructor = indicesAccessor;
    const indices = new indicesConstructor(nIndices);
    const dracoInt32Array = new decoderModule.DracoInt32Array();
    for (let iFace = 0; iFace < nFaces; ++iFace) {
        decoder.GetFaceFromMesh(dracoMesh, iFace, dracoInt32Array);
        const index = 3 * iFace;
        indices[index] = dracoInt32Array.GetValue(0);
        indices[index + 1] = dracoInt32Array.GetValue(1);
        indices[index + 2] = dracoInt32Array.GetValue(2);
    }
    decoderModule.destroy(dracoInt32Array);
    return indices;
}
