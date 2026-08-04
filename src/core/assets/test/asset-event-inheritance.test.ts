import * as assetdb from '@cocos/asset-db';
import * as fse from 'fs-extra';
import * as path from 'path';
import { IAssetInfo } from '../@types/public';
import assetManager from '../manager/asset';
import assetDBManager from '../manager/asset-db';

const DATABASE_NAME = 'asset-event-inheritance';
const PATH = {
    ROOT: path.join(__dirname, DATABASE_NAME),
    TARGET: path.join(__dirname, `${DATABASE_NAME}/target`),
    LIBRARY: path.join(__dirname, `${DATABASE_NAME}/library`),
    TEMP: path.join(__dirname, `${DATABASE_NAME}/temp`),
    SOURCE: path.join(__dirname, `${DATABASE_NAME}/target/inheritance.inheritance`),
    UNKNOWN_SOURCE: path.join(__dirname, `${DATABASE_NAME}/target/unknown.unknown-inheritance`),
};
type ClassConstructor = { prototype: object };

class InheritanceImporter extends assetdb.Importer {
    get name() {
        return 'asset-event-inheritance';
    }

    get assetType() {
        return 'cc.Texture2D';
    }

    async import(asset: assetdb.Asset | assetdb.VirtualAsset) {
        if (!asset.parent) {
            asset.meta.displayName = 'Root texture';
            await asset.createSubAsset('child', this.name, {
                displayName: 'Child texture',
            });
        } else if (asset._name === 'child') {
            asset.meta.displayName = 'Child texture';
            await asset.createSubAsset('grandchild', this.name, {
                displayName: 'Grandchild texture',
            });
        } else {
            asset.meta.displayName = 'Grandchild texture';
        }
        return true;
    }
}

class UnregisteredInheritanceImporter extends assetdb.Importer {
    get name() {
        return 'unregistered-asset-event-inheritance';
    }

    get assetType() {
        return 'cc.UnregisteredAsset';
    }

    async import() {
        return true;
    }
}

describe('asset add and change inheritance payloads', () => {
    let database: assetdb.AssetDB | undefined;
    let originalReady: boolean;
    let originalCC: unknown;

    const managerInternals = assetManager as typeof assetManager & {
        _onAssetDBCreated(database: assetdb.AssetDB): void;
        _onAssetDBRemoved(database: assetdb.AssetDB): void;
    };

    beforeAll(() => {
        originalReady = assetDBManager.ready;
        originalCC = (globalThis as { cc?: unknown }).cc;
        (globalThis as { cc?: unknown }).cc = createClassRegistry();
    });

    afterAll(() => {
        if (originalCC === undefined) {
            delete (globalThis as { cc?: unknown }).cc;
        } else {
            (globalThis as { cc?: unknown }).cc = originalCC;
        }
    });

    beforeEach(async () => {
        await fse.remove(PATH.ROOT);
        await Promise.all([
            fse.ensureDir(PATH.TARGET),
            fse.ensureDir(PATH.LIBRARY),
            fse.ensureDir(PATH.TEMP),
        ]);

        database = assetdb.create({
            name: DATABASE_NAME,
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
            ignoreFiles: [],
            readonly: false,
        });
        database.importerManager.add(InheritanceImporter, ['.inheritance']);
        database.importerManager.add(UnregisteredInheritanceImporter, ['.unknown-inheritance']);

        assetDBManager.assetDBMap[DATABASE_NAME] = database;
        assetDBManager.assetDBInfo[DATABASE_NAME] = {
            name: DATABASE_NAME,
            target: PATH.TARGET,
            readonly: false,
            temp: PATH.TEMP,
            library: PATH.LIBRARY,
            level: 0,
            globList: [],
            ignoreFiles: [],
            visible: true,
            state: 'none',
            preImportExtList: [],
        };
        assetDBManager.ready = true;
        managerInternals._onAssetDBCreated(database);

        await database.start();
    });

    afterEach(async () => {
        if (database) {
            managerInternals._onAssetDBRemoved(database);
            await database.stop();
        }
        delete assetDBManager.assetDBMap[DATABASE_NAME];
        delete assetDBManager.assetDBInfo[DATABASE_NAME];
        assetDBManager.ready = originalReady;
        await fse.remove(PATH.ROOT);
    });

    it('emits recursive inheritance metadata after assets are added and changed', async () => {
        const added = jest.fn();
        const changed = jest.fn();
        const removeAdded = assetManager.onAssetAdded(added);
        const removeChanged = assetManager.onAssetChanged(changed);

        try {
            await fse.outputFile(PATH.SOURCE, 'initial');
            await database!.refresh(PATH.SOURCE);

            const asset = database!.path2asset.get(PATH.SOURCE);
            expect(asset).toBeDefined();
            expectInheritancePayload(findEventInfo(added, asset!.uuid));

            await database!.reimport(asset!.uuid);

            expectInheritancePayload(findEventInfo(changed, asset!.uuid));
        } finally {
            removeAdded();
            removeChanged();
        }
    });

    it('does not fail when querying inheritance for an unregistered asset type', async () => {
        await fse.outputFile(PATH.UNKNOWN_SOURCE, 'unknown');
        await database!.refresh(PATH.UNKNOWN_SOURCE);

        const asset = database!.path2asset.get(PATH.UNKNOWN_SOURCE);
        expect(asset).toBeDefined();

        let assetInfo: IAssetInfo | undefined;
        expect(() => {
            assetInfo = assetManager.queryAssetInfos(undefined, ['subAssets', 'displayName', 'extends'])
                .find((info) => info.uuid === asset!.uuid);
        }).not.toThrow();

        expect(assetInfo).toMatchObject({
            uuid: asset!.uuid,
            type: 'cc.UnregisteredAsset',
            extends: [],
        });
    });
});

function expectInheritancePayload(info: IAssetInfo | null): void {
    expect(info).not.toBeNull();
    expect(info!.displayName).toBe('Root texture');
    expect(info!.extends).toEqual(expect.arrayContaining(['cc.TextureBase', 'cc.Asset']));

    const child = findSubAsset(info!, 'child');
    expect(child).toBeDefined();
    expect(child!.displayName).toBe('Child texture');
    expect(child!.extends).toEqual(expect.arrayContaining(['cc.TextureBase', 'cc.Asset']));

    const grandchild = findSubAsset(child!, 'grandchild');
    expect(grandchild).toBeDefined();
    expect(grandchild!.displayName).toBe('Grandchild texture');
    expect(grandchild!.extends).toEqual(expect.arrayContaining(['cc.TextureBase', 'cc.Asset']));
}

function findSubAsset(info: IAssetInfo, name: string): IAssetInfo | undefined {
    return Object.values(info.subAssets || {}).find((subAsset) => subAsset.name === name);
}

function findEventInfo(listener: jest.Mock, uuid: string): IAssetInfo | null {
    return listener.mock.calls
        .map(([info]) => info as IAssetInfo | null)
        .find((info) => info?.uuid === uuid) || null;
}

function createClassRegistry() {
    class Asset {}
    class TextureBase extends Asset {}
    class Texture2D extends TextureBase {}

    const classNames = new Map<ClassConstructor, string>([
        [Asset, 'cc.Asset'],
        [TextureBase, 'cc.TextureBase'],
        [Texture2D, 'cc.Texture2D'],
    ]);

    return {
        js: {
            getClassByName(name: string) {
                return Array.from(classNames).find(([, className]) => className === name)?.[0];
            },
            getSuper(target: ClassConstructor): ClassConstructor | undefined {
                return Object.getPrototypeOf(target.prototype)?.constructor as ClassConstructor | undefined;
            },
            getClassName(target: ClassConstructor | undefined) {
                return target ? classNames.get(target) || '' : '';
            },
        },
    };
}
