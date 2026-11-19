import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
jest.mock('@cocos/asset-db', () => ({}));
jest.mock('../asset-handler/assets/utils/material-upgrader', () => ({ upgradeProperties: jest.fn(async () => false) }));
jest.mock('../asset-handler/utils', () => ({ getDependUUIDList: () => [] }));
import { MaterialHandler } from '../asset-handler/assets/material';
const importer = MaterialHandler.importer as { import(asset: unknown): Promise<boolean> };
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'material-import-')); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); jest.restoreAllMocks(); });
function fixture(effect: unknown, include = true) {
    const source = join(directory, 'material.mtl');
    const data = { __type__: 'cc.Material', ...(include ? { _effectAsset: effect } : {}), _props: [{ mainColor: { r: 188, g: 188, b: 188, a: 255 } }] };
    writeFileSync(source, JSON.stringify(data));
    return { source, basename: 'material', depend: jest.fn(), saveToLibrary: jest.fn(async () => {}), setData: jest.fn() };
}
it.each([undefined, null])('imports an unassigned material without an invalid dependency (%s)', async effect => {
    const asset = fixture(effect, effect !== undefined);
    const before = readFileSync(asset.source, 'utf8');
    expect(await importer.import(asset)).toBe(true);
    expect(asset.depend).not.toHaveBeenCalled();
    expect(asset.saveToLibrary).toHaveBeenCalledWith('.json', expect.any(String));
    expect(readFileSync(asset.source, 'utf8')).toBe(before);
});
it('retains an assigned effect dependency', async () => {
    const uuid = '2de6c7a5-200c-4505-939c-f787b0dd6b19';
    const asset = fixture({ __uuid__: uuid });
    expect(await importer.import(asset)).toBe(true);
    expect(asset.depend).toHaveBeenCalledWith(uuid);
});
it('rejects malformed effect references with an asset-specific error', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const asset = fixture({ __uuid__: 123 });
    expect(await importer.import(asset)).toBe(false);
    expect(asset.depend).not.toHaveBeenCalled();
    expect(asset.saveToLibrary).not.toHaveBeenCalled();
    expect(error.mock.calls[0][0].message).toContain(asset.source);
});
