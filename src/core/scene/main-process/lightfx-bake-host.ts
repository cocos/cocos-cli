import { randomUUID } from 'crypto';
import {
    appendFile,
    copy,
    ensureDir,
    outputFile,
    pathExists,
    readFile,
    readdir,
    remove,
} from 'fs-extra';
import { basename, dirname, join } from 'path';
import Utils from '../../base/utils';
import type {
    IAppendLightFXInputOptions,
    IBeginLightFXBakeOptions,
    IBeginLightFXBakeResult,
    ILightFXBakeHostService,
    ILightFXOperationOptions,
    ILightFXTextureSource,
    IRemoveLightmapAssetsOptions,
    IResolvedLightFXTextureSource,
    IResolveLightFXTextureSourceOptions,
    IRunLightFXBakeOptions,
    IRunLightFXBakeResult,
    LightFXBakeTarget,
} from '../common/lightfx-host';
import { assetManager } from '../../assets';
import { LightmapAssetTransaction } from './lightfx/asset-transaction';
import { decodeLightFXOutput } from './lightfx/output';
import { LightFXProcess } from './lightfx/process';

type OperationState = 'accepting-input' | 'running' | 'awaiting-commit';
type OperationTerminalState = 'committed' | 'rolled-back' | 'cancelled' | 'expired';

interface LightFXHostOperation {
    id: string;
    target: LightFXBakeTarget;
    sceneName: string;
    timeoutMs: number;
    workspace: string;
    inputPath: string;
    outputDir: string;
    targetDir: string;
    targetUrl: string;
    refreshUrl: string;
    inputBytes: number;
    inputWritePromise: Promise<void>;
    state: OperationState;
    controller: AbortController;
    runner: LightFXProcess;
    assets: LightmapAssetTransaction | null;
    cleanupPromise: Promise<void> | null;
    expiryTimer: NodeJS.Timeout | null;
    terminalState: OperationTerminalState | null;
}

interface ResolvedTextureSource extends IResolvedLightFXTextureSource {
    sourcePath: string;
}

const MAX_REMEMBERED_OPERATIONS = 32;
const MAX_INPUT_CHUNK_BASE64_LENGTH = 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024 * 1024;
const MAX_TEXTURE_SOURCES = 10_000;

/**
 * Executes every Node-only part of a LightFX bake on behalf of either a Scene worker or a browser
 * Scene Webview. Only one operation can exist at a time, including the apply/save transaction gap.
 */
export class LightFXBakeHost implements ILightFXBakeHostService {
    private operation: LightFXHostOperation | null = null;
    private readonly completedOperations = new Map<string, OperationTerminalState>();

    public async resolveTextureSource(
        options: IResolveLightFXTextureSourceOptions,
    ): Promise<IResolvedLightFXTextureSource | null> {
        const resolved = await this.resolveHostTextureSource(options);
        return resolved ? { fileName: resolved.fileName } : null;
    }

    public async begin(options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult> {
        if (this.operation) {
            throw new Error(`A ${this.operation.target} LightFX bake is already in progress.`);
        }
        this.validateBeginOptions(options);

        const assetRoot = this.queryAssetRoot();
        const projectRoot = dirname(assetRoot);
        const operationId = randomUUID();
        const workspace = join(
            projectRoot,
            'temp',
            'lightfx-bake',
            `${options.target}-${Date.now()}-${process.pid}-${operationId.slice(0, 8)}`,
        );
        const tmpDir = join(workspace, 'tmp');
        const outputDir = join(workspace, 'output');
        const targetDir = join(assetRoot, options.sceneName, 'lightmap');
        const targetUrl = `db://assets/${options.sceneName}/lightmap`;
        const operation: LightFXHostOperation = {
            id: operationId,
            target: options.target,
            sceneName: options.sceneName,
            timeoutMs: options.timeoutMs,
            workspace,
            inputPath: join(tmpDir, 'lfx.in'),
            outputDir,
            targetDir,
            targetUrl,
            refreshUrl: `db://assets/${options.sceneName}`,
            inputBytes: 0,
            inputWritePromise: Promise.resolve(),
            state: 'accepting-input',
            controller: new AbortController(),
            runner: new LightFXProcess(),
            assets: null,
            cleanupPromise: null,
            expiryTimer: null,
            terminalState: null,
        };

        // Reserve the global operation before the first asynchronous filesystem call.
        this.operation = operation;
        try {
            await ensureDir(tmpDir);
            await ensureDir(outputDir);
            await outputFile(operation.inputPath, Buffer.alloc(0));
            await this.copyTextureSources(options.textureSources, tmpDir);
            this.armExpiry(operation);
            return { operationId };
        } catch (error) {
            this.decideTerminalState(operation, 'rolled-back');
            await this.cleanup(operation, false);
            throw error;
        }
    }

    public async appendInput(options: IAppendLightFXInputOptions): Promise<void> {
        const operation = this.requireActiveOperation(options.operationId);
        if (operation.state !== 'accepting-input') {
            throw new Error('LightFX input can only be appended before the bake starts.');
        }
        const chunk = this.decodeBase64Chunk(options.chunkBase64);
        if (!chunk.length) {
            return;
        }
        if (operation.inputBytes + chunk.length > MAX_INPUT_BYTES) {
            this.decideTerminalState(operation, 'rolled-back');
            await this.cleanup(operation, true);
            throw new Error('LightFX input exceeds the 1 GiB limit.');
        }
        const writePromise = operation.inputWritePromise.then(async () => {
            this.throwIfTerminated(operation);
            await appendFile(operation.inputPath, chunk);
            operation.inputBytes += chunk.length;
        });
        operation.inputWritePromise = writePromise.catch(() => undefined);
        await writePromise;
    }

    public async run(options: IRunLightFXBakeOptions): Promise<IRunLightFXBakeResult> {
        const operation = this.requireActiveOperation(options.operationId);
        if (operation.state !== 'accepting-input') {
            throw new Error('LightFX bake has already started.');
        }
        operation.state = 'running';

        try {
            await operation.inputWritePromise;
            this.throwIfTerminated(operation);
            if (!operation.inputBytes) {
                throw new Error('LightFX input is empty.');
            }
            await operation.runner.run({
                cwd: operation.workspace,
                timeoutMs: operation.timeoutMs,
                signal: operation.controller.signal,
                onLog: (line) => console.log(`[LightFX] ${line}`),
            });
            this.throwIfTerminated(operation);
            const result = decodeLightFXOutput(await readFile(join(operation.outputDir, 'lfx.out')));
            const textureUrls = operation.target === 'lightmap'
                ? await this.stageLightmapAssets(operation)
                : [];
            this.throwIfTerminated(operation);
            operation.state = 'awaiting-commit';
            return { result, textureUrls };
        } catch (error) {
            const terminalError = operation.terminalState === 'cancelled' || operation.terminalState === 'expired'
                ? this.terminalOperationError(operation.terminalState)
                : error;
            if (!operation.terminalState) {
                this.decideTerminalState(operation, 'rolled-back');
            }
            await this.cleanup(operation, true);
            throw terminalError;
        }
    }

    public async commit(options: ILightFXOperationOptions): Promise<void> {
        this.validateOperationId(options.operationId);
        const completedState = this.completedOperations.get(options.operationId);
        if (completedState === 'committed') {
            return;
        }
        if (completedState) {
            throw this.cannotCommitError(completedState);
        }
        const operation = this.requireOperation(options.operationId);
        if (operation.terminalState === 'committed') {
            await operation.cleanupPromise;
            return;
        }
        if (operation.terminalState) {
            throw this.cannotCommitError(operation.terminalState);
        }
        if (operation.state !== 'awaiting-commit') {
            throw new Error('LightFX bake cannot be committed before it finishes.');
        }
        // This synchronous decision is the linearization point shared with cancellation and expiry.
        this.decideTerminalState(operation, 'committed');
        try {
            await this.cleanup(operation, false);
        } catch (error) {
            // The scene and generated assets are already committed. A temporary-workspace cleanup
            // failure must not turn a successful bake into a rollback request from the Scene side.
            console.warn('[LightFX] Failed to remove the completed bake workspace:', error);
        }
    }

    public async rollback(options: ILightFXOperationOptions): Promise<void> {
        this.validateOperationId(options.operationId);
        const completedState = this.completedOperations.get(options.operationId);
        if (completedState === 'committed') {
            throw new Error('A committed LightFX bake cannot be rolled back.');
        }
        if (completedState) {
            return;
        }
        const operation = this.requireOperation(options.operationId);
        if (operation.terminalState === 'committed') {
            throw new Error('A committed LightFX bake cannot be rolled back.');
        }
        if (operation.terminalState && operation.terminalState !== 'rolled-back') {
            if (operation.cleanupPromise) {
                await operation.cleanupPromise;
            }
            return;
        }
        if (!operation.terminalState) {
            this.decideTerminalState(operation, 'rolled-back');
        }
        operation.controller.abort();
        await operation.runner.cancel();
        await this.cleanup(operation, true);
    }

    public async cancel(): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }> {
        const operation = this.operation;
        if (!operation) {
            return { cancelled: false, target: null };
        }
        if (operation.terminalState) {
            return { cancelled: false, target: null };
        }
        this.decideTerminalState(operation, 'cancelled');
        operation.controller.abort();
        await operation.runner.cancel();
        // While run() owns output staging, its catch path must also own rollback. Cleaning here
        // could otherwise restore the backup concurrently with stageLightmapAssets().
        if (operation.state !== 'running') {
            await this.cleanup(operation, true);
        }
        return { cancelled: true, target: operation.target };
    }

    public async removeLightmapAssets(options: IRemoveLightmapAssetsOptions): Promise<void> {
        if (this.operation) {
            throw new Error(`A ${this.operation.target} LightFX bake is already in progress.`);
        }
        this.validateSceneName(options.sceneName);
        const targetDir = join(this.queryAssetRoot(), options.sceneName, 'lightmap');
        await remove(targetDir);
        await assetManager.refreshAsset(`db://assets/${options.sceneName}`);
    }

    /** Releases an abandoned operation when its owning Scene host shuts down. */
    public async dispose(): Promise<void> {
        const operation = this.operation;
        if (!operation) {
            return;
        }
        if (operation.terminalState === 'committed') {
            await operation.cleanupPromise;
            return;
        }
        if (!operation.terminalState) {
            this.decideTerminalState(operation, 'cancelled');
        }
        operation.controller.abort();
        await operation.runner.cancel();
        await this.cleanup(operation, true);
    }

    private validateBeginOptions(options: IBeginLightFXBakeOptions): void {
        if (!options || (options.target !== 'light-probe' && options.target !== 'lightmap')) {
            throw new Error('Invalid LightFX bake target.');
        }
        this.validateSceneName(options.sceneName);
        if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 3_600_000) {
            throw new Error('LightFX timeout must be an integer between 1000 and 3600000 milliseconds.');
        }
        if (!Array.isArray(options.textureSources) || options.textureSources.length > MAX_TEXTURE_SOURCES) {
            throw new Error('Invalid LightFX texture source list.');
        }
    }

    private validateSceneName(sceneName: string): void {
        if (
            typeof sceneName !== 'string'
            || !sceneName.trim()
            || sceneName === '.'
            || sceneName === '..'
            || /[<>:"/\\|?*\0]/.test(sceneName)
            || /[. ]$/.test(sceneName)
        ) {
            throw new Error('Invalid LightFX scene name.');
        }
    }

    private async copyTextureSources(textureSources: ILightFXTextureSource[], textureDir: string): Promise<void> {
        const fileNames = new Set<string>();
        for (const texture of textureSources) {
            const resolved = await this.resolveHostTextureSource(texture);
            if (!resolved) {
                throw new Error(`LightFX texture source is unavailable: ${texture.uuid}`);
            }
            if (texture.fileName !== resolved.fileName || basename(texture.fileName) !== texture.fileName) {
                throw new Error(`Invalid LightFX texture file name: ${texture.fileName}`);
            }
            if (fileNames.has(texture.fileName)) {
                continue;
            }
            fileNames.add(texture.fileName);
            await copy(resolved.sourcePath, join(textureDir, texture.fileName));
        }
    }

    private async resolveHostTextureSource(
        options: IResolveLightFXTextureSourceOptions,
    ): Promise<ResolvedTextureSource | null> {
        if (!options || typeof options.uuid !== 'string') {
            throw new Error('Invalid LightFX texture UUID.');
        }
        const uuid = Utils.UUID.decompressUUID(options.uuid);
        if (!Utils.UUID.isUUID(uuid)) {
            throw new Error('Invalid LightFX texture UUID.');
        }
        if (
            typeof options.nativeExtension !== 'string'
            || !/^(?:\.[a-zA-Z0-9_-]+)?$/.test(options.nativeExtension)
        ) {
            throw new Error('Invalid LightFX texture native extension.');
        }

        let sourcePath: string | null = null;
        if (uuid.includes('@')) {
            const projectRoot = dirname(this.queryAssetRoot());
            sourcePath = join(
                projectRoot,
                'library',
                uuid.slice(0, 2),
                `${uuid}${options.nativeExtension}`,
            );
        } else {
            sourcePath = assetManager.queryPath(uuid) || null;
        }
        if (!sourcePath || !(await pathExists(sourcePath))) {
            return null;
        }
        const safeUuid = uuid.replace(/[^a-zA-Z0-9_.-]/g, '_');
        return {
            sourcePath,
            fileName: `${safeUuid}-${basename(sourcePath)}`,
        };
    }

    private decodeBase64Chunk(value: string): Buffer {
        if (
            typeof value !== 'string'
            || value.length > MAX_INPUT_CHUNK_BASE64_LENGTH
            || value.length % 4 !== 0
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
        ) {
            throw new Error('Invalid base64 LightFX input chunk.');
        }
        return Buffer.from(value, 'base64');
    }

    private async stageLightmapAssets(operation: LightFXHostOperation): Promise<string[]> {
        const files = (await readdir(operation.outputDir))
            .filter((file) => file.toLowerCase().endsWith('.png'))
            .sort((a, b) => a.localeCompare(b));
        if (!files.length) {
            throw new Error('LightFX did not produce any lightmap textures.');
        }

        const assets = new LightmapAssetTransaction(operation.targetDir, operation.workspace);
        operation.assets = assets;
        await assets.prepare();
        for (const file of files) {
            if (basename(file) !== file) {
                throw new Error(`Invalid LightFX output file name: ${file}`);
            }
            await copy(join(operation.outputDir, file), join(operation.targetDir, file), { overwrite: true });
            await assets.preserveMeta(file);
        }
        await assetManager.refreshAsset(operation.targetUrl);

        for (const file of files) {
            this.throwIfTerminated(operation);
            const url = `${operation.targetUrl}/${file}`;
            const uuid = await this.waitForAsset(operation, url, Math.min(operation.timeoutMs, 60_000));
            await this.disableAlphaFix(uuid);
        }
        return files.map((file) => `${operation.targetUrl}/${file}`);
    }

    private async waitForAsset(operation: LightFXHostOperation, url: string, timeoutMs: number): Promise<string> {
        const deadline = Date.now() + timeoutMs;
        do {
            this.throwIfTerminated(operation);
            const uuid = assetManager.queryUUID(url);
            if (uuid) {
                return uuid;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        } while (Date.now() < deadline);
        throw new Error(`Lightmap texture import timed out: ${url}`);
    }

    private async disableAlphaFix(uuid: string): Promise<void> {
        const meta = assetManager.queryAssetMeta(uuid) as any;
        if (!meta) {
            throw new Error(`Lightmap texture metadata is unavailable: ${uuid}`);
        }
        if (meta.userData?.fixAlphaTransparencyArtifacts === false) {
            return;
        }
        meta.userData ??= {};
        meta.userData.fixAlphaTransparencyArtifacts = false;
        await assetManager.saveAssetMeta(uuid, meta);
    }

    private queryAssetRoot(): string {
        const assetRoot = assetManager.queryPath('db://assets');
        if (!assetRoot) {
            throw new Error('The db://assets directory is unavailable.');
        }
        return assetRoot;
    }

    private requireOperation(operationId: string): LightFXHostOperation {
        this.validateOperationId(operationId);
        const operation = this.operation;
        if (!operation || operation.id !== operationId) {
            throw new Error(`Unknown LightFX operation: ${operationId}`);
        }
        return operation;
    }

    private requireActiveOperation(operationId: string): LightFXHostOperation {
        this.validateOperationId(operationId);
        const operation = this.operation;
        if (operation?.id === operationId) {
            this.throwIfTerminated(operation);
            return operation;
        }
        const terminalState = this.completedOperations.get(operationId);
        if (terminalState) {
            throw this.terminalOperationError(terminalState);
        }
        throw new Error(`Unknown LightFX operation: ${operationId}`);
    }

    private validateOperationId(operationId: string): void {
        if (typeof operationId !== 'string' || !operationId) {
            throw new Error('Invalid LightFX operation id.');
        }
    }

    private cannotCommitError(state: Exclude<OperationTerminalState, 'committed'>): Error {
        return new Error(`LightFX bake was ${state} and cannot be committed.`);
    }

    private terminalOperationError(state: OperationTerminalState): Error {
        switch (state) {
            case 'cancelled':
                return new Error('LightFX bake was cancelled.');
            case 'expired':
                return new Error('LightFX bake timed out.');
            case 'rolled-back':
                return new Error('LightFX bake was rolled back.');
            case 'committed':
                return new Error('LightFX bake has already completed.');
        }
    }

    private decideTerminalState(operation: LightFXHostOperation, state: OperationTerminalState): void {
        if (operation.terminalState) {
            if (operation.terminalState === state) {
                return;
            }
            throw new Error(`LightFX bake was already ${operation.terminalState}.`);
        }
        operation.terminalState = state;
    }

    private throwIfTerminated(operation: LightFXHostOperation): void {
        if (operation.terminalState) {
            throw this.terminalOperationError(operation.terminalState);
        }
        if (operation.controller.signal.aborted) {
            throw new Error('LightFX bake was cancelled.');
        }
    }

    private armExpiry(operation: LightFXHostOperation): void {
        operation.expiryTimer = setTimeout(() => {
            if (this.operation !== operation || operation.terminalState) {
                return;
            }
            this.decideTerminalState(operation, 'expired');
            operation.controller.abort();
            void (async () => {
                await operation.runner.cancel();
                // A running operation serializes rollback through run()'s catch path.
                if (operation.state !== 'running') {
                    await this.cleanup(operation, true);
                }
            })().catch((error) => console.error('[LightFX] Failed to clean up an expired bake:', error));
        }, operation.timeoutMs);
        operation.expiryTimer.unref?.();
    }

    private cleanup(operation: LightFXHostOperation, rollbackAssets: boolean): Promise<void> {
        if (operation.cleanupPromise) {
            return operation.cleanupPromise;
        }
        const cleanupPromise = (async () => {
            // All terminal paths converge here. Do not remove the workspace while an input chunk
            // that was accepted before cancellation, rollback, expiry or disposal is still writing.
            await operation.inputWritePromise;
            if (operation.expiryTimer) {
                clearTimeout(operation.expiryTimer);
                operation.expiryTimer = null;
            }
            if (rollbackAssets && operation.assets) {
                // Do not remove the workspace: it owns the only backup from which rollback can be
                // retried when either restoration or the following Asset DB refresh fails.
                await operation.assets.rollback();
                await assetManager.refreshAsset(operation.refreshUrl);
            }
            let cleanupError: unknown;
            try {
                await remove(operation.workspace);
            } catch (error) {
                cleanupError = error;
                if (rollbackAssets) {
                    throw error;
                }
            }
            if (!operation.terminalState) {
                throw new Error('LightFX operation cleanup requires a terminal state.');
            }
            this.rememberCompletedOperation(operation.id, operation.terminalState);
            if (this.operation === operation) {
                this.operation = null;
            }
            if (cleanupError) {
                throw cleanupError;
            }
        })().catch((error) => {
            // A failed rollback must remain active and retryable, with its backup workspace intact.
            if (operation.cleanupPromise === cleanupPromise) {
                operation.cleanupPromise = null;
            }
            throw error;
        });
        operation.cleanupPromise = cleanupPromise;
        return cleanupPromise;
    }

    private rememberCompletedOperation(operationId: string, state: OperationTerminalState): void {
        this.completedOperations.set(operationId, state);
        if (this.completedOperations.size > MAX_REMEMBERED_OPERATIONS) {
            const oldest = this.completedOperations.keys().next().value as string | undefined;
            if (oldest) {
                this.completedOperations.delete(oldest);
            }
        }
    }
}

export const lightFXBakeHost = new LightFXBakeHost();
