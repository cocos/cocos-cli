import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const mockSelection = { path: '.', version: '3.6.0' };
jest.mock('../../../global', () => ({ getEngineSelection: () => mockSelection }));
import { resolveLibraryAssetFile } from '../library-file';
const uuid = '52d8039c-9f65-4d9c-9a24-eec5cb0ed5a8';
let directory: string;
function ccon() {
    const json = Buffer.from('{}');
    const bytes = Buffer.alloc(16 + json.length);
    bytes.writeUInt32LE(0x4e4f4343, 0); bytes.writeUInt32LE(1, 4);
    bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(json.length, 12);
    json.copy(bytes, 16); return bytes;
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'library-ccon-')); mkdirSync(join(directory, '52')); mockSelection.version = '3.6.0'; });
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it.each(['3.6.0', '3.7.0', '3.8.3', '4.0.0-beta.0'])('resolves valid serialized .bin assets for %s', async version => {
    mockSelection.version = version;
    const file = join(directory, '52', uuid + '.bin'); writeFileSync(file, ccon());
    expect(await resolveLibraryAssetFile(`52/${uuid}.cconb`, [directory])).toBe(file);
});
it('resolves a serialized GLTF subresource without falling back to its parent UUID', async () => {
    const file = join(directory, '52', uuid + '@57e42.bin'); writeFileSync(file, ccon());
    expect(await resolveLibraryAssetFile(`52/${uuid}@57e42.cconb`, [directory])).toBe(file);
    expect(await resolveLibraryAssetFile(`52/${uuid}@other.cconb`, [directory])).toBeUndefined();
});
it('preserves exact-file priority across library roots', async () => {
    writeFileSync(join(directory, '52', uuid + '.bin'), ccon());
    const second = join(directory, 'second'); mkdirSync(join(second, '52'), { recursive: true });
    const file = join(second, '52', uuid + '.cconb'); writeFileSync(file, ccon());
    expect(await resolveLibraryAssetFile(`52/${uuid}.cconb`, [directory, second])).toBe(file);
});
it('rejects ordinary, truncated and unsupported binary envelopes', async () => {
    const wrongVersion = ccon(); wrongVersion.writeUInt32LE(2, 4);
    const invalidLength = ccon(); invalidLength.writeUInt32LE(999, 8);
    for (const bytes of [Buffer.from('native binary data'), ccon().subarray(0, 12), wrongVersion, invalidLength]) {
        writeFileSync(join(directory, '52', uuid + '.bin'), bytes);
        expect(await resolveLibraryAssetFile(`52/${uuid}.cconb`, [directory])).toBeUndefined();
    }
});
it('does not alias arbitrary native filenames or allow directory traversal', async () => {
    writeFileSync(join(directory, '52', 'mesh.bin'), ccon());
    expect(await resolveLibraryAssetFile('52/mesh.cconb', [directory])).toBeUndefined();
    expect(await resolveLibraryAssetFile('../outside.cconb', [directory])).toBeUndefined();
});
