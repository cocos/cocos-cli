import { decodeCCONBinary } from 'cc/editor/serialization';
import { readFile } from 'fs-extra';

export async function transformCCON(path: string) {
    const buffer = await readFile(path);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return decodeCCONBinary(bytes);
}
