import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

class TypedArrayDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        // @ts-ignore
        if (object instanceof BigInt64Array) {
            // @ts-ignore
            data.value = new BigInt64Array(object);
        }
        // @ts-ignore
        else if (object instanceof BigUint64Array) {
            // @ts-ignore
            data.value = new BigUint64Array(object);
        }
        // @ts-ignore
        else if (object instanceof Float32Array) {
            // @ts-ignore
            data.value = new Float32Array(object);
        }
        // @ts-ignore
        else if (object instanceof Float64Array) {
            // @ts-ignore
            data.value = new Float64Array(object);
        }
        // @ts-ignore
        else if (object instanceof Int8Array) {
            // @ts-ignore
            data.value = new Int8Array(object);
        }
        // @ts-ignore
        else if (object instanceof Int16Array) {
            // @ts-ignore
            data.value = new Int16Array(object);
        }
        // @ts-ignore
        else if (object instanceof Int32Array) {
            // @ts-ignore
            data.value = new Int32Array(object);
        }
        // @ts-ignore
        else if (object instanceof Uint8Array) {
            // @ts-ignore
            data.value = new Uint8Array(object);
        }
        // @ts-ignore
        else if (object instanceof Uint8ClampedArray) {
            // @ts-ignore
            data.value = new Uint8ClampedArray(object);
        }
        // @ts-ignore
        else if (object instanceof Uint16Array) {
            // @ts-ignore
            data.value = new Uint16Array(object);
        }
        // @ts-ignore
        else if (object instanceof Uint32Array) {
            // @ts-ignore
            data.value = new Uint32Array(object);
        }
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        // @ts-ignore
        if (BigInt64Array && dump.value instanceof BigInt64Array) {
            // @ts-ignore
            data[info.key] = new BigInt64Array(dump.value);
        }
        // @ts-ignore
        else if (BigUint64Array && dump.value instanceof BigUint64Array) {
            // @ts-ignore
            data[info.key] = new BigUint64Array(dump.value);
        }
        // @ts-ignore
        else if (Float32Array && dump.value instanceof Float32Array) {
            // @ts-ignore
            data[info.key] = new Float32Array(dump.value);
        }
        // @ts-ignore
        else if (Float64Array && dump.value instanceof Float64Array) {
            // @ts-ignore
            data[info.key] = new Float64Array(dump.value);
        }
        // @ts-ignore
        else if (Int8Array && dump.value instanceof Int8Array) {
            // @ts-ignore
            data[info.key] = new Int8Array(dump.value);
        }
        // @ts-ignore
        else if (Int16Array && dump.value instanceof Int16Array) {
            // @ts-ignore
            data[info.key] = new Int16Array(dump.value);
        }
        // @ts-ignore
        else if (Int32Array && dump.value instanceof Int32Array) {
            // @ts-ignore
            data[info.key] = new Int32Array(dump.value);
        }
        // @ts-ignore
        else if (Uint8Array && dump.value instanceof Uint8Array) {
            // @ts-ignore
            data[info.key] = new Uint8Array(dump.value);
        }
        // @ts-ignore
        else if (Uint8ClampedArray && dump.value instanceof Uint8ClampedArray) {
            // @ts-ignore
            data[info.key] = new Uint8ClampedArray(dump.value);
        }
        // @ts-ignore
        else if (Uint16Array && dump.value instanceof Uint16Array) {
            // @ts-ignore
            data[info.key] = new Uint16Array(dump.value);
        }
        // @ts-ignore
        else if (Uint32Array && dump.value instanceof Uint32Array) {
            // @ts-ignore
            data[info.key] = new Uint32Array(dump.value);
        }
    }
}

export const typedArrayDump = new TypedArrayDump();
