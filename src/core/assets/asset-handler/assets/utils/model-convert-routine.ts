import { Asset, AssetDB } from '@editor/asset-db';
import fs from 'fs-extra';
import ps from 'path';

interface IConvertStatus {
    /**
     * Version of the converter.
     */
    version: string;

    /**
     * Time stamp of source.
     */
    sourceTimeStamp: number;

    /**
     * Time stamps of each recursive file in output dir.
     */
    outputTimeStamps: Record<string, number>;

    /**
     * Convert options, used for cache validation.
     */
    options?: unknown;
}

export interface IAbstractConverter<T> {
    readonly options?: unknown;

    convert(asset: Asset, outputDir: string): Promise<boolean>;

    printLogs?(asset: Asset, outputDir: string): void | Promise<void>;

    get(asset: Asset, outputDir: string): T | Promise<T>;
}

/**
 * @param converterId
 * @param asset
 * @param assetDB
 * @param version
 * @param converter
 */
export async function modelConvertRoutine<T>(
    converterId: string,
    asset: Asset,
    assetDB: AssetDB,
    version: string,
    converter: IAbstractConverter<T>,
): Promise<T | undefined> {
    const workspace = ps.join(assetDB.options.temp, converterId, asset.uuid);
    await fs.ensureDir(workspace);

    const sourceTimeStamp = (await fs.stat(asset.source)).mtimeMs;

    const statusFile = ps.join(workspace, 'status.json');
    let oldStatus: IConvertStatus | undefined;
    try {
        oldStatus = await fs.readJson(statusFile);
    } catch (err) {
        console.debug(`Status file ${statusFile}: ${err}`);
    }

    const outputDir = ps.join(workspace, 'output');
    await fs.ensureDir(outputDir);

    const converterOptions = converter.options;

    const isCacheAvailable =
        oldStatus !== undefined &&
        oldStatus.version === version &&
        oldStatus.sourceTimeStamp === sourceTimeStamp &&
        validateOptions(converterOptions, oldStatus.options) &&
        (await isOutputTimeStampsAvailable(outputDir, oldStatus.outputTimeStamps));

    if (!isCacheAvailable) {
        await fs.emptyDir(outputDir);

        const ok = await converter.convert(asset, outputDir);
        if (!ok) {
            return;
        }

        const outputTimeStamps: Record<string, number> = {};
        await getMtimeTree(outputDir, outputTimeStamps);
        const status: IConvertStatus = {
            version,
            sourceTimeStamp,
            outputTimeStamps,
            options: converterOptions,
        };
        await fs.ensureDir(ps.dirname(statusFile));
        await fs.writeJson(statusFile, status, { spaces: 2 });
    }

    await converter.printLogs?.(asset, outputDir);

    return await converter.get(asset, outputDir);
}

async function getMtimeTree(baseDir: string, record: Record<string, number>, prefix: string | undefined = undefined) {
    const items = await fs.readdir(baseDir);
    await Promise.all(
        items.map(async (item) => {
            const file = ps.join(baseDir, item);
            const stat = await fs.stat(file);
            const key = prefix ? `${prefix}/${item}` : item;
            if (stat.isFile()) {
                record[key] = stat.mtimeMs;
            } else if (stat.isDirectory()) {
                await getMtimeTree(file, record, key);
            }
        }),
    );
}

async function isOutputTimeStampsAvailable(baseDir: string, record: Record<string, number>) {
    return (
        await Promise.all(
            Object.entries(record).map(async ([key, mTimeMs]) => {
                const file = ps.join(baseDir, ps.join(...key.split('/')));
                try {
                    const stat = await fs.stat(file);
                    return stat.mtimeMs === mTimeMs;
                } catch {
                    return false;
                }
            }),
        )
    ).every((b) => b);
}

function validateOptions(newOptions: unknown, oldOptions: unknown) {
    return matchObject(newOptions, oldOptions);
}

function matchObject(lhs: unknown, rhs: unknown) {
    return matchLhs(lhs, rhs);

    function matchLhs(lhs: unknown, rhs: unknown): boolean {
        if (Array.isArray(lhs)) {
            return Array.isArray(rhs) && lhs.length === rhs.length && lhs.every((v, i) => matchLhs(v, rhs[i]));
        } else if (typeof lhs === 'object' && lhs !== null) {
            return (
                typeof rhs === 'object' && rhs !== null && Object.keys(lhs).every((key) => matchLhs((lhs as any)[key], (rhs as any)[key]))
            );
        } else if (lhs === null) {
            return rhs === null;
        } else {
            return lhs === rhs;
        }
    }
}
