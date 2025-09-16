import { Asset, AssetDB } from '@editor/asset-db';
import fs from 'fs-extra';
import { dirname, join } from 'path';
import { convert } from '../utils/fbx2glTf';
import tmp from 'tmp';
import { i18nTranslate } from '../../utils';

export async function fbxToGlTf(asset: Asset, assetDB: AssetDB, version: string): Promise<string> {
    const tmpDirDir = assetDB.options.temp;

    const tmpDir = join(tmpDirDir, `fbx2gltf-${asset.uuid}`);

    await fs.ensureDir(tmpDir);

    const destPath = join(tmpDir, 'out', 'out.gltf');

    const statusFilePath = join(tmpDir, 'status.json');

    const expectedStatus: ConversionStatus = {
        mtimeMs: (await fs.stat(asset.source)).mtimeMs,
        version,
    };

    try {
        if (await fs.pathExists(statusFilePath)) {
            const conversionStatus = JSON.parse((await fs.readFile(statusFilePath)).toString()) as ConversionStatus;
            if (isSameConversionStatus(conversionStatus, expectedStatus) && (await fs.pathExists(destPath))) {
                return destPath;
            }
        }
    } catch {
        console.debug(`Failed to get conversion status file ${statusFilePath}`);
    }

    if (await fs.pathExists(tmpDir)) {
        await fs.emptyDir(tmpDir);
    }

    const tempDirGenerators: Array<() => string> = [
        () => join(tmpDir, 'fbm'),
        () => {
            const tmpDirResult = tmp.dirSync({
                mode: 777,
                prefix: 'fbm',
            });
            return tmpDirResult.name;
        },
    ];
    let fbxTempDir: string | null = null;
    for (const tempDirGenerator of tempDirGenerators) {
        const str = tempDirGenerator();
        // eslint-disable-next-line no-control-regex
        if (/^[\x00-\x7F]*$/.test(str)) {
            fbxTempDir = str;
            break;
        }
    }
    if (!fbxTempDir) {
        throw new Error(i18nTranslate('engine-extends.importers.fbx.no_available_fbx_temp_dir'));
    }
    await fs.ensureDir(fbxTempDir);

    const extraOptions: string[] = ['--fbx-temp-dir', fbxTempDir];

    await fs.ensureDir(dirname(destPath));
    await convert(asset.source, destPath, extraOptions);

    if (fs.existsSync(destPath)) {
        console.debug(`${asset.source} is converted to: ${destPath}`);
        await fs.writeFile(statusFilePath, JSON.stringify(expectedStatus, undefined, 2));
        return destPath;
    }

    throw new Error(
        i18nTranslate('engine-extends.importers.fbx.failed_to_convert_fbx_file', {
            path: asset.source,
        }),
    );
}

interface ConversionStatus {
    mtimeMs: number;
    version: string;
}

function isSameConversionStatus(lhs: ConversionStatus, rhs: ConversionStatus) {
    return lhs.mtimeMs === rhs.mtimeMs && lhs.version === rhs.version;
}
