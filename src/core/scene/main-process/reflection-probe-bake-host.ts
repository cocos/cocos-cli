import { access, constants } from 'fs/promises';
import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import {
    copy,
    ensureDir,
    existsSync,
    move,
    outputJson,
    pathExists,
    readJson,
    readdir,
    remove,
} from 'fs-extra';
import { basename, dirname, join } from 'path';
import { assetManager } from '../../assets';
import type {
    IPrepareReflectionProbeBakeOptions,
    IPreparedReflectionProbeBake,
    IReflectionProbeBakeHostService,
    IReflectionProbeBakeOperationOptions,
} from '../common/reflection-probe-host';
import { isReflectionProbeTextureCubeImported } from '../scene-process/service/reflection-probe-import-state';

const POLL_INTERVAL_MS = 200;
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

interface IOutputTransaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

interface IHostOperation {
    id: string;
    outputUrl: string;
    transaction: IOutputTransaction;
    expiryTimer: NodeJS.Timeout | null;
    settling?: Promise<void>;
}

/**
 * Owns the Node-only half of reflection-probe baking. Browser Scene runtimes send captured RGBA
 * faces here, then commit only after the resulting TextureCube has been applied to their scene.
 */
export class ReflectionProbeBakeHost implements IReflectionProbeBakeHostService {
    private operation: IHostOperation | null = null;
    private cmftProcess: ChildProcess | null = null;
    private preparing = false;
    private preparingTaskId?: string;
    private cancelled = false;

    public async getCapabilities(): Promise<{ bake: boolean; reason?: string }> {
        try {
            const executable = this.resolveCmftExecutable();
            await access(executable, constants.X_OK);
            const assetRoot = assetManager.queryPath('db://assets');
            if (!assetRoot) { throw new Error('The project asset directory is unavailable.'); }
            await access(assetRoot, constants.W_OK);
            await import('sharp');
            return { bake: true };
        } catch (error) {
            return { bake: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    public async prepare(options: IPrepareReflectionProbeBakeOptions): Promise<IPreparedReflectionProbeBake> {
        if (this.operation || this.preparing) {
            throw new Error('A reflection-probe output transaction is already in progress.');
        }
        const { captured, timeoutMs } = options ?? {} as IPrepareReflectionProbeBakeOptions;
        this.validateCapturedFaces(captured);
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe host timeoutMs must be greater than zero.');
        }

        const deadline = Date.now() + timeoutMs;
        const assetRoot = assetManager.queryPath('db://assets');
        if (!assetRoot) {
            throw new Error('The db://assets directory is unavailable.');
        }
        const sceneDir = join(assetRoot, captured.sceneName);
        const backupRoot = join(assetRoot, '..', 'temp', 'reflection-probe-bake');
        const operationId = randomUUID();
        const workDir = join(backupRoot, `work-${process.pid}-${Date.now()}-${captured.probeId}`);
        const outputBase = join(sceneDir, `reflectionProbe_${captured.probeId}`);
        const outputPath = `${outputBase}.png`;
        const outputUrl = `db://assets/${captured.sceneName}/reflectionProbe_${captured.probeId}.png`;
        const stagedBase = join(workDir, `reflectionProbe_${captured.probeId}`);
        const stagedOutputPath = `${stagedBase}.png`;
        let transaction: IOutputTransaction | null = null;

        this.preparing = true;
        this.preparingTaskId = options.taskId;
        this.cancelled = false;
        try {
            await ensureDir(sceneDir);
            await ensureDir(workDir);
            await this.cleanupLegacyWorkingFiles(sceneDir, captured.probeId);
            const facePaths = await this.writeFaces(captured.faces, workDir, captured.resolution, deadline);
            await this.runCmft(facePaths, stagedBase, deadline);
            this.assertBeforeDeadline(deadline, 'output preparation');
            await this.prepareMeta(stagedOutputPath, captured.fastBake, outputPath);
            transaction = await this.replaceOutput(
                stagedOutputPath,
                outputPath,
                backupRoot,
                captured.fastBake,
            );
            this.assertBeforeDeadline(deadline, 'asset import');
            await assetManager.refreshAssetOnly(outputUrl);
            if (!captured.fastBake) {
                await this.ensureConvolution(outputBase, outputUrl, deadline);
            }
            await this.waitForTextureCubeImport(outputPath, captured.fastBake, deadline);
            const cubeInfo = await this.waitForTextureCube(`${outputUrl}/textureCube`, deadline);
            const remaining = Math.max(1, deadline - Date.now());
            const operation: IHostOperation = {
                id: operationId,
                outputUrl,
                transaction,
                expiryTimer: null,
            };
            operation.expiryTimer = setTimeout(() => {
                if (this.operation === operation) {
                    void this.finish(operation, true).catch((error) => {
                        console.error('[ReflectionProbe] Failed to retain an unacknowledged output transaction:', error);
                    });
                }
            }, remaining);
            this.operation = operation;
            return {
                operationId,
                cubemapUuid: cubeInfo.uuid,
                cubemapUrl: cubeInfo.url,
            };
        } catch (error) {
            if (transaction) {
                await transaction.rollback();
                await assetManager.refreshAssetOnly(outputUrl).catch(() => undefined);
            }
            throw error;
        } finally {
            await this.removeWithRetry(workDir);
            this.cmftProcess = null;
            this.preparing = false;
            this.preparingTaskId = undefined;
        }
    }

    public async cancel(options: { taskId: string }): Promise<void> {
        if (!options?.taskId) { throw new Error('A reflection-probe task ID is required.'); }
        if (this.preparing && this.preparingTaskId === options.taskId) {
            this.cancelled = true;
            this.cmftProcess?.kill();
        }
    }

    public async commit(options: IReflectionProbeBakeOperationOptions): Promise<void> {
        await this.finish(this.requireOperation(options), true);
    }

    public async rollback(options: IReflectionProbeBakeOperationOptions): Promise<void> {
        await this.finish(this.requireOperation(options), false);
    }

    public async dispose(): Promise<void> {
        this.cancelled = true;
        this.cmftProcess?.kill();
        this.cmftProcess = null;
        if (this.operation) {
            await this.finish(this.operation, true);
        }
    }

    private requireOperation(options: IReflectionProbeBakeOperationOptions): IHostOperation {
        if (!options?.operationId || this.operation?.id !== options.operationId) {
            throw new Error(`Unknown reflection-probe output transaction: ${options?.operationId || 'missing'}.`);
        }
        return this.operation;
    }

    private finish(operation: IHostOperation, commit: boolean): Promise<void> {
        if (operation.settling) { return operation.settling; }
        if (operation.expiryTimer) {
            clearTimeout(operation.expiryTimer);
            operation.expiryTimer = null;
        }
        operation.settling = (async () => {
            try {
                if (commit) {
                    await operation.transaction.commit();
                } else {
                    await operation.transaction.rollback();
                    await assetManager.refreshAssetOnly(operation.outputUrl).catch(() => undefined);
                }
            } finally {
                if (this.operation === operation) { this.operation = null; }
            }
        })();
        return operation.settling;
    }

    private validateCapturedFaces(captured: IPrepareReflectionProbeBakeOptions['captured']): void {
        if (!captured || typeof captured.sceneName !== 'string'
            || !captured.sceneName || captured.sceneName !== basename(captured.sceneName)
            || captured.sceneName === '.' || captured.sceneName === '..'
            || typeof captured.componentUuid !== 'string' || !captured.componentUuid
            || !Number.isInteger(captured.probeId) || captured.probeId < 0
            || !Number.isInteger(captured.resolution) || captured.resolution <= 0
            || typeof captured.fastBake !== 'boolean'
            || !Array.isArray(captured.faces) || captured.faces.length !== FACE_NAMES.length
            || captured.faces.some((face) => typeof face !== 'string' || !face)) {
            throw new Error('Invalid reflection-probe capture data for the Node bake host.');
        }
    }

    private async writeFaces(
        faces: string[],
        workDir: string,
        resolution: number,
        deadline: number,
    ): Promise<string[]> {
        const result: string[] = [];
        try {
            const sharp = (await import('sharp')).default;
            const decodedFaces = faces.map((face, index) => {
                const data = Buffer.from(face, 'base64');
                if (data.length !== resolution * resolution * 4) {
                    throw new Error(`Reflection probe face ${FACE_NAMES[index]} has an invalid byte length.`);
                }
                return data;
            });
            const hasAnyColor = decodedFaces.some((data) => {
                for (let offset = 0; offset < data.length; offset += 4) {
                    if (data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0) {
                        return true;
                    }
                }
                return false;
            });
            if (!hasAnyColor) {
                throw new Error('All reflection probe faces are empty; refusing to overwrite the existing bake.');
            }
            for (let index = 0; index < FACE_NAMES.length; index++) {
                this.assertBeforeDeadline(deadline, 'render texture readback');
                const facePath = join(workDir, `${FACE_NAMES[index]}.png`);
                result.push(facePath);
                await sharp(decodedFaces[index], {
                    raw: { width: resolution, height: resolution, channels: 4 },
                }).png().toFile(facePath);
            }
            return result;
        } catch (error) {
            await Promise.all(result.map(async (path) => remove(path).catch(() => undefined)));
            throw error;
        }
    }

    private async runCmft(facePaths: string[], outputBase: string, deadline: number): Promise<void> {
        const executable = this.resolveCmftExecutable();
        const args = [
            '--rgbm',
            '--bypassoutputtype',
            '--output0params', 'png,rgbm,latlong',
            '--inputFacePosX', facePaths[0],
            '--inputFaceNegX', facePaths[1],
            '--inputFacePosY', facePaths[2],
            '--inputFaceNegY', facePaths[3],
            '--inputFacePosZ', facePaths[4],
            '--inputFaceNegZ', facePaths[5],
            '--output0', outputBase,
        ];
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error('Reflection probe bake timed out before cmft started.');
        }
        await new Promise<void>((resolve, reject) => {
            const child = this.cmftProcess = spawn(executable, args, { windowsHide: true });
            let stderr = '';
            child.stderr?.on('data', (data) => { stderr += String(data); });
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error('Reflection probe bake timed out while running cmft.'));
            }, remaining);
            child.once('error', (error) => {
                clearTimeout(timer);
                reject(new Error(`Failed to start cmft: ${error.message}`));
            });
            child.once('close', (code) => {
                clearTimeout(timer);
                this.cmftProcess = null;
                if (code !== 0) {
                    reject(new Error(`cmft exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
                } else {
                    resolve();
                }
            });
        });
        if (!await pathExists(`${outputBase}.png`)) {
            throw new Error(`cmft did not create the expected output: ${outputBase}.png`);
        }
    }

    private resolveCmftExecutable(): string {
        const suffix = process.platform === 'win32' ? '.exe' : '';
        const staticDir = join(__dirname, '../../../../static');
        const candidates = [
            join(staticDir, `tools/cmft/cmftRelease64${suffix}`),
            join(staticDir, `tools/cmft/cmft${suffix}`),
        ];
        const executable = candidates.find(existsSync);
        if (!executable) {
            throw new Error(`cmft executable was not found (checked ${candidates.join(', ')}).`);
        }
        return executable;
    }

    private async prepareMeta(outputPath: string, fastBake: boolean, previousOutputPath?: string): Promise<void> {
        const metaPath = `${outputPath}.meta`;
        let meta: any = {};
        const previousMetaPath = previousOutputPath ? `${previousOutputPath}.meta` : metaPath;
        if (await pathExists(previousMetaPath)) {
            meta = await readJson(previousMetaPath);
        }
        meta.ver ??= '0.0.0';
        meta.importer ??= '*';
        meta.imported = false;
        meta.userData ??= {};
        meta.userData.type = 'texture cube';
        meta.userData.isRGBE = true;
        meta.subMetas ??= {};
        meta.subMetas.b47c0 ??= {};
        meta.subMetas.b47c0.imported = false;
        meta.subMetas.b47c0.userData ??= {};
        meta.subMetas.b47c0.userData.mipBakeMode = fastBake ? 1 : 2;
        for (const child of Object.values(meta.subMetas.b47c0.subMetas ?? {}) as any[]) {
            child.imported = false;
        }
        await outputJson(metaPath, meta, { spaces: 2 });
    }

    private async replaceOutput(
        stagedOutputPath: string,
        outputPath: string,
        backupRoot: string,
        fastBake: boolean,
    ): Promise<IOutputTransaction> {
        await this.cleanupLegacyBackupMetas(outputPath);
        const backupDir = join(backupRoot, `${process.pid}-${Date.now()}`);
        await ensureDir(backupDir);
        const outputBase = outputPath.slice(0, -4);
        const targets = [outputPath, `${outputPath}.meta`, `${outputBase}_convolution`];
        const backups = targets.map((_target, index) => join(backupDir, String(index)));
        const savedBackups: Array<{ target: string; backup: string }> = [];
        const restore = async () => {
            await Promise.all(targets.map(async (target) => remove(target).catch(() => undefined)));
            for (const { target, backup } of savedBackups) {
                if (await pathExists(backup)) {
                    await copy(backup, target, { overwrite: true });
                }
            }
            await remove(backupDir).catch(() => undefined);
        };
        try {
            for (let index = 0; index < targets.length; index++) {
                if (await pathExists(targets[index])) {
                    await copy(targets[index], backups[index], { overwrite: false });
                    savedBackups.push({ target: targets[index], backup: backups[index] });
                }
            }
            if (fastBake) {
                await remove(`${outputBase}_convolution`).catch(() => undefined);
            } else {
                await Promise.all(FACE_NAMES.map(async (_face, index) => (
                    remove(join(`${outputBase}_convolution`, `mipmap_${index}.png`)).catch(() => undefined)
                )));
            }
            await move(stagedOutputPath, outputPath, { overwrite: true });
            await move(`${stagedOutputPath}.meta`, `${outputPath}.meta`, { overwrite: true });
        } catch (error) {
            await restore();
            throw error;
        }
        return {
            commit: async () => remove(backupDir).catch(() => undefined),
            rollback: restore,
        };
    }

    private async cleanupLegacyBackupMetas(outputPath: string): Promise<void> {
        const prefix = `${basename(outputPath)}.bake-backup-`;
        const entries = await readdir(dirname(outputPath)).catch(() => []);
        await Promise.all(entries
            .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.meta'))
            .map(async (entry) => this.removeWithRetry(join(dirname(outputPath), entry))));
    }

    private async cleanupLegacyWorkingFiles(sceneDir: string, probeId: number): Promise<void> {
        const prefix = `.reflection-probe-${probeId}-`;
        const entries = await readdir(sceneDir).catch(() => []);
        await Promise.all(entries.filter((entry) => {
            if (!entry.startsWith(prefix)) {
                return false;
            }
            const suffix = entry.slice(prefix.length);
            return FACE_NAMES.some((face) => suffix === `${face}.png` || suffix === `${face}.png.meta`)
                || /^\d+\.png(?:\.meta)?$/.test(suffix);
        }).map(async (entry) => this.removeWithRetry(join(sceneDir, entry))));
    }

    private async ensureConvolution(outputBase: string, outputUrl: string, deadline: number): Promise<void> {
        const convolutionDir = `${outputBase}_convolution`;
        if (!await this.hasCompleteConvolution(convolutionDir)) {
            this.assertBeforeDeadline(deadline, 'texture cube convolution');
            await this.prepareMeta(`${outputBase}.png`, false);
            await assetManager.refreshAssetOnly(outputUrl);
        }
        while (Date.now() < deadline) {
            this.assertBeforeDeadline(deadline, 'asset import');
            if (await this.hasCompleteConvolution(convolutionDir)) {
                return;
            }
            await this.delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        throw new Error(`TextureCube convolution mipmaps were not generated before timeout: ${outputUrl}`);
    }

    private async hasCompleteConvolution(convolutionDir: string): Promise<boolean> {
        return (await Promise.all(FACE_NAMES.map((_face, index) => (
            pathExists(join(convolutionDir, `mipmap_${index}.png`))
        )))).every(Boolean);
    }

    private async waitForTextureCubeImport(outputPath: string, fastBake: boolean, deadline: number): Promise<void> {
        const metaPath = `${outputPath}.meta`;
        while (Date.now() < deadline) {
            this.assertBeforeDeadline(deadline, 'asset import');
            try {
                const meta = await readJson(metaPath);
                if (isReflectionProbeTextureCubeImported(meta, fastBake ? 1 : 2)) {
                    return;
                }
            } catch {
                // Asset DB may replace the meta file while an import is in progress.
            }
            await this.delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        throw new Error(`TextureCube and its six faces were not fully imported before timeout: ${metaPath}`);
    }

    private async waitForTextureCube(url: string, deadline: number): Promise<{ uuid: string; url: string }> {
        let lastError: unknown;
        while (Date.now() < deadline) {
            this.assertBeforeDeadline(deadline, 'asset import');
            try {
                const info = assetManager.queryAssetInfo(url);
                if (info?.uuid && info.url) {
                    return { uuid: info.uuid, url: info.url };
                }
            } catch (error) {
                lastError = error;
            }
            await this.delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
        throw new Error(`TextureCube subasset was not imported before timeout: ${url}.${detail}`);
    }

    private assertBeforeDeadline(deadline: number, stage: string): void {
        if (this.cancelled) { throw new Error('Reflection-probe bake cancelled.'); }
        if (Date.now() >= deadline) {
            throw new Error(`Reflection probe bake timed out during ${stage}.`);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async removeWithRetry(path: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await remove(path);
                return;
            } catch {
                if (attempt < 2) {
                    await this.delay(50 * (attempt + 1));
                }
            }
        }
    }
}

export const reflectionProbeBakeHost = new ReflectionProbeBakeHost();
