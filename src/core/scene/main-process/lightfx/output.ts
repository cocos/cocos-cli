import type { ILightFXResult } from '../../common/lightfx-host';

const LIGHTFX_OUTPUT_VERSIONS = new Set([0x2000, 0x2002, 0x2003, 0x3730]);
const MAX_COLLECTION_LENGTH = 10_000_000;

const enum LightFXChunk {
    EOF = 0,
    TERRAIN = 1,
    MESH = 2,
    LIGHT_PROBE = 4,
}

class LightFXOutputReader {
    private readonly view: DataView;
    private cursor = 0;

    constructor(input: Uint8Array) {
        this.view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    }

    public get remaining(): number {
        return this.view.byteLength - this.cursor;
    }

    public readInt32(): number {
        this.ensure(4);
        const value = this.view.getInt32(this.cursor, true);
        this.cursor += 4;
        return value;
    }

    public readFloat(): number {
        this.ensure(4);
        const value = this.view.getFloat32(this.cursor, true);
        this.cursor += 4;
        if (!Number.isFinite(value)) {
            throw new Error('LightFX output contains a non-finite float.');
        }
        return value;
    }

    public readFloats(count: number): number[] {
        this.validateCount(count);
        return Array.from({ length: count }, () => this.readFloat());
    }

    public readCount(label: string): number {
        const count = this.readInt32();
        if (count < 0 || count > MAX_COLLECTION_LENGTH) {
            throw new Error(`Invalid LightFX ${label} count: ${count}.`);
        }
        return count;
    }

    private validateCount(count: number): void {
        if (!Number.isInteger(count) || count < 0 || count > MAX_COLLECTION_LENGTH) {
            throw new Error(`Invalid LightFX array length: ${count}.`);
        }
    }

    private ensure(size: number): void {
        if (this.cursor + size > this.view.byteLength) {
            throw new Error('LightFX output is truncated.');
        }
    }
}

export function decodeLightFXOutput(input: Uint8Array): ILightFXResult {
    const reader = new LightFXOutputReader(input);
    const result: ILightFXResult = {
        version: reader.readInt32(),
        meshes: [],
        terrains: [],
        probes: [],
    };
    if (!LIGHTFX_OUTPUT_VERSIONS.has(result.version)) {
        throw new Error(`Unsupported LightFX output version: 0x${result.version.toString(16)}.`);
    }

    while (reader.remaining > 0) {
        const chunk = reader.readInt32();
        if (chunk === LightFXChunk.EOF) {
            return result;
        }
        if (chunk === LightFXChunk.TERRAIN) {
            const id = reader.readInt32();
            const count = reader.readCount('terrain');
            for (let i = 0; i < count; i++) {
                result.terrains.push({
                    id,
                    blockId: reader.readInt32(),
                    index: reader.readInt32(),
                    offset: reader.readFloats(2),
                    scale: reader.readFloats(2),
                });
            }
        } else if (chunk === LightFXChunk.MESH) {
            const count = reader.readCount('mesh');
            for (let i = 0; i < count; i++) {
                result.meshes.push({
                    id: reader.readInt32(),
                    index: reader.readInt32(),
                    offset: reader.readFloats(2),
                    scale: reader.readFloats(2),
                });
            }
        } else if (chunk === LightFXChunk.LIGHT_PROBE) {
            const count = reader.readCount('light probe');
            for (let i = 0; i < count; i++) {
                result.probes.push({
                    position: reader.readFloats(3),
                    normal: reader.readFloats(3),
                    coefficients: reader.readFloats(reader.readCount('coefficient')),
                });
            }
        } else {
            throw new Error(`Unknown LightFX output chunk: ${chunk}.`);
        }
    }
    throw new Error('LightFX output has no EOF chunk.');
}
