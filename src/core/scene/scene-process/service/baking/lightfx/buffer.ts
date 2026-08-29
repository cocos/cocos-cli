const MAX_COLLECTION_LENGTH = 10_000_000;

export class LightFXBuffer {
    private data: Uint8Array;
    private view: DataView;
    private cursor = 0;
    private length = 0;

    constructor(input?: Uint8Array) {
        this.data = input ?? new Uint8Array(2048);
        this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
        this.length = input?.byteLength ?? 0;
    }
    toUint8Array(): Uint8Array { return this.data.slice(0, this.length); }
    get remaining(): number { return this.length - this.cursor; }
    writeInt8(value: number): void { this.reserve(1); this.view.setInt8(this.length, value); this.length++; }
    writeInt32(value: number): void { this.reserve(4); this.view.setInt32(this.length, value, true); this.length += 4; }
    writeFloat(value: number): void { this.reserve(4); this.view.setFloat32(this.length, value, true); this.length += 4; }
    writeInts(values: number[]): void { values.forEach((value) => this.writeInt32(value)); }
    writeFloats(values: number[]): void { values.forEach((value) => this.writeFloat(value)); }
    writeHeightField(values: Uint16Array): void { this.reserve(values.length * 2); for (const value of values) { this.view.setUint16(this.length, value, true); this.length += 2; } }
    writeString(value: string): void { const encoded = Buffer.from(value, 'utf8'); this.writeInt32(encoded.length); this.reserve(encoded.length); this.data.set(encoded, this.length); this.length += encoded.length; }
    readInt8(): number { this.ensure(1); const value = this.view.getInt8(this.cursor); this.cursor++; return value; }
    readInt32(): number { this.ensure(4); const value = this.view.getInt32(this.cursor, true); this.cursor += 4; return value; }
    readFloat(): number { this.ensure(4); const value = this.view.getFloat32(this.cursor, true); this.cursor += 4; if (!Number.isFinite(value)) throw new Error('LightFX output contains a non-finite float.'); return value; }
    readFloats(count: number): number[] { this.validateCount(count); return Array.from({ length: count }, () => this.readFloat()); }
    readCount(label: string): number { const count = this.readInt32(); if (count < 0 || count > MAX_COLLECTION_LENGTH) throw new Error(`Invalid LightFX ${label} count: ${count}.`); return count; }
    private validateCount(count: number): void { if (!Number.isInteger(count) || count < 0 || count > MAX_COLLECTION_LENGTH) throw new Error(`Invalid LightFX array length: ${count}.`); }
    private ensure(size: number): void { if (this.cursor + size > this.length) throw new Error('LightFX output is truncated.'); }
    private reserve(size: number): void { const required = this.length + size; if (required <= this.data.byteLength) return; let capacity = this.data.byteLength || 1; while (capacity < required) capacity *= 2; const next = new Uint8Array(capacity); next.set(this.data); this.data = next; this.view = new DataView(next.buffer); }
}
