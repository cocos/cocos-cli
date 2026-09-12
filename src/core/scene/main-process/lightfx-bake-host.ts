import { randomUUID } from 'crypto';
import {
    appendFile,
    copy,
    ensureDir,
    outputFile,
    pathExists,
    readFile,
    readdir,
    realpath,
    remove,
    stat,
} from 'fs-extra';
import { basename, dirname, isAbsolute, join, relative, sep } from 'path';
import Utils from '../../base/utils';
import type {
    IAppendLightFXInputOptions,
    IBeginLightFXBakeOptions,
    IBeginLightFXBakeResult,
    ILightFXBakeHostService,
    ILightFXHostCapabilities,
    ILightFXOperationOptions,
    ILightFXTextureSource,
    IQueryLightmapTextureInfoOptions,
    IQueryLightmapTextureInfoResult,
    IRemoveLightmapAssetsOptions,
    IRemoveLightmapAssetsResult,
    IResolvedLightFXTextureSource,
    IResolveLightFXTextureSourceOptions,
    IRunLightFXBakeOptions,
    IRunLightFXBakeResult,
    LightFXBakeTarget,
    IReserveLightFXSceneOperationOptions,
    ILightFXSceneOperationToken,
    ICancelLightFXOperationOptions,
    ILightFXDiagnostics,
    IPublishLightmapAssetsOptions,
} from '../common/lightfx-host';
import { assetDBManager, assetManager } from '../../assets';
import type { IAssetInfo } from '../../assets/@types/public';
import { LightmapAssetTransaction } from './lightfx/asset-transaction';
import { LightmapAssetRecord } from './lightfx/asset-record';
import { isLightmapTextureUrl, lightmapAuxiliaryPath, publishLightmapTextures, removeEmptyLightmapVersion } from './lightfx/asset-publication';
import { decodeLightFXOutput } from './lightfx/output';
import { LightFXProcess } from './lightfx/process';

type OperationState = 'accepting-input' | 'running' | 'awaiting-commit';
type OperationTerminalState = 'committed' | 'rolled-back' | 'cancelled' | 'expired';

interface LightFXHostOperation {
    sceneStats?: IBeginLightFXBakeOptions['sceneStats'];
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
    assetRecord?: LightmapAssetRecord;
    recordedTextureUuids?: string[];
    recordedAuxiliaryUuids?: string[];
    publicationRootUrl: string;
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

function isImmutableLightmapTexture(url: string | undefined): boolean {
    const parts = url?.startsWith('db://assets/') ? url.slice('db://assets/'.length).split('/') : [];
    const version = parts.at(-2) ?? '';
    return /^LFX_(?:Mesh|Terrain)_\d{4,}\.png$/.test(parts.at(-1) ?? '')
        && version.startsWith('bake-') && Utils.UUID.isUUID(version.slice('bake-'.length));
}

/** Reads only the native percentage format observed on the dedicated Progress channel. */
export function parseLightFXProgressRate(value: unknown): number | undefined {
    if (typeof value !== 'string') { return undefined; }
    const match = /^Build lighting (?<rate>\d{1,3}(?:\.\d+)?)%$/.exec(value.trim());
    if (!match?.groups) { return undefined; }
    const rate = Number(match.groups.rate);
    return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : undefined;
}

/**
 * Executes every Node-only part of a LightFX bake on behalf of either a Scene worker or a browser
 * Scene Webview. Only one operation can exist at a time, including the apply/save transaction gap.
 */
export class LightFXBakeHost implements ILightFXBakeHostService {
    private operation: LightFXHostOperation | null = null;
    private readonly completedOperations = new Map<string, OperationTerminalState>();
    private readonly diagnostics = new Map<string, { owner: ICancelLightFXOperationOptions; value: ILightFXDiagnostics }>();
    private sceneOperation: (IReserveLightFXSceneOperationOptions & ILightFXSceneOperationToken & {
        nativeStarted: boolean; nativeCommitted: boolean; removingAssets: boolean;
        publication?: { operationId: string; textureUuids: string[]; auxiliaryUuids: string[]; stagingUrl: string; rootUrl: string };
    }) | null = null;
    private readonly releasedSceneOperations = new Set<string>();

    public async queryCapabilities(): Promise<ILightFXHostCapabilities> {
        return { sceneTransactionVersion: 1, lightmapAssetVersion: 1, lightmapOutputDirectory: true, lightmapAssetCleanupVersion: 1, lightmapRebakeCleanupVersion: 1, lightmapPublicationVersion: 1, lightmapAuxiliaryAssetsVersion: 1, cancelOwnershipVersion: 1, diagnosticsVersion: 1, busy: this.sceneOperation !== null || this.operation !== null };
    }

    public async queryDiagnostics(options: ICancelLightFXOperationOptions): Promise<ILightFXDiagnostics | undefined> {
        const entry = this.diagnostics.get(options?.operationId);
        if (!entry || entry.owner.target !== options.target || entry.owner.transactionId !== options.transactionId) { return undefined; }
        return structuredClone(entry.value);
    }

    private diagnosticText(operation: LightFXHostOperation, value: unknown): string {
        let text: string;
        try { text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''; } catch { return ''; }
        for (const [path, label] of [[operation.workspace, '<bake workspace>'], [operation.targetDir, '<lightmap assets>']]) {
            if (!path) continue;
            // Object payloads have JSON-escaped Windows paths; plain logs do not.
            text = text.split(JSON.stringify(path).slice(1, -1)).join(label).split(path).join(label);
        }
        return text.slice(0, 2048);
    }

    private appendLightmapLog(operation: LightFXHostOperation, message: unknown): void {
        const logs = this.diagnostics.get(operation.id)!.value.logs;
        const text = this.diagnosticText(operation, message).trim();
        if (!text || logs.at(-1) === text) return;
        logs.push(text);
        if (logs.length > 128) {
            logs.splice(0, logs.length - 127);
            logs.unshift('[Earlier baking log entries omitted.]');
        }
    }

    private lightmapImagesStage(operation: LightFXHostOperation): void {
        const message = 'The baking is ready to complete and begin generating images.';
        if (!this.diagnostics.get(operation.id)!.value.logs.includes(message)) this.appendLightmapLog(operation, message);
    }

    public async reserveSceneOperation(options: IReserveLightFXSceneOperationOptions): Promise<ILightFXSceneOperationToken> {
        if (!options || !['light-probe', 'lightmap'].includes(options.target) || !['bake', 'clear'].includes(options.action)) {
            throw new Error('Invalid LightFX scene operation.');
        }
        if (this.sceneOperation || this.operation) throw new Error('A LightFX scene transaction is already in progress on the host.');
        const transactionId = randomUUID();
        // No await before reservation. A lost renderer keeps this locked rather than admitting
        // another writer while its old scene transaction might still resume.
        this.sceneOperation = { target: options.target, action: options.action, transactionId, nativeStarted: false, nativeCommitted: false, removingAssets: false };
        return { transactionId };
    }

    public async releaseSceneOperation(options: ILightFXSceneOperationToken): Promise<void> {
        const id = options?.transactionId;
        if (typeof id !== 'string' || !id) throw new Error('Invalid LightFX scene transaction id.');
        if (this.releasedSceneOperations.has(id)) return;
        if (this.sceneOperation?.transactionId !== id) throw new Error('Unknown LightFX scene transaction.');
        if (this.operation || this.sceneOperation.removingAssets) throw new Error('LightFX host cleanup has not finished; scene transaction remains reserved.');
        this.sceneOperation = null;
        this.releasedSceneOperations.add(id);
        if (this.releasedSceneOperations.size > MAX_REMEMBERED_OPERATIONS) {
            this.releasedSceneOperations.delete(this.releasedSceneOperations.values().next().value!);
        }
    }

    private validateSceneOperation(transactionId: string | undefined, target: LightFXBakeTarget, action: 'bake' | 'clear'): void {
        if (!this.sceneOperation && transactionId === undefined) return; // Legacy native callers still reserve this.operation.
        const current = this.sceneOperation;
        if (!current || current.transactionId !== transactionId || current.target !== target || current.action !== action) {
            throw new Error('LightFX scene transaction ownership does not match.');
        }
    }

    public async resolveTextureSource(
        options: IResolveLightFXTextureSourceOptions,
    ): Promise<IResolvedLightFXTextureSource | null> {
        const resolved = await this.resolveHostTextureSource(options);
        return resolved ? { fileName: resolved.fileName } : null;
    }

    public async queryLightmapTextureInfo(
        options: IQueryLightmapTextureInfoOptions,
    ): Promise<IQueryLightmapTextureInfoResult> {
        if (!options || !Array.isArray(options.uuids) || options.uuids.length > MAX_TEXTURE_SOURCES) {
            throw new Error('Invalid Lightmap texture UUID list.');
        }

        const uuids = [...new Set(options.uuids.map((value) => {
            if (typeof value !== 'string') {
                throw new Error('Invalid Lightmap texture UUID.');
            }
            const uuid = Utils.UUID.decompressUUID(value).split('@', 1)[0];
            if (!Utils.UUID.isUUID(uuid)) {
                throw new Error('Invalid Lightmap texture UUID.');
            }
            return uuid;
        }))];
        const textures: IQueryLightmapTextureInfoResult['textures'] = [];
        const missingTextureUuids: string[] = [];
        for (const uuid of uuids) {
            const info = assetManager.queryAssetInfo(uuid);
            if (!info?.file || !info.url) {
                missingTextureUuids.push(uuid);
                continue;
            }
            try {
                const fileStat = await stat(info.file);
                textures.push({
                    uuid: info.uuid || uuid,
                    url: info.url,
                    filename: basename(info.file),
                    size: fileStat.size,
                    createdAt: fileStat.birthtimeMs,
                    modifiedAt: fileStat.mtimeMs,
                });
            } catch {
                missingTextureUuids.push(uuid);
            }
        }
        const ownedTextureUuids = options.sceneUuid === undefined ? undefined
            : (await new LightmapAssetRecord(dirname(this.queryAssetRoot()), options.sceneUuid).read())
                .filter(uuid => !!assetManager.queryAssetInfo(uuid));
        return { textures, missingTextureUuids, ...(ownedTextureUuids ? { ownedTextureUuids } : {}) };
    }

    public async begin(options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult> {
        if (this.operation) {
            throw new Error(`A ${this.operation.target} LightFX bake is already in progress.`);
        }
        this.validateBeginOptions(options);
        this.validateSceneOperation(options.transactionId, options.target, 'bake');
        if (this.sceneOperation?.nativeStarted) throw new Error('This LightFX scene transaction has already started a bake.');

        const assetRoot = this.queryAssetRoot();
        const projectRoot = dirname(assetRoot);
        const assetRecord = options.target === 'lightmap' && options.sceneUuid !== undefined
            ? new LightmapAssetRecord(projectRoot, options.sceneUuid) : undefined;
        const operationId = randomUUID();
        const workspace = join(
            projectRoot,
            'temp',
            'lightfx-bake',
            `${options.target}-${Date.now()}-${process.pid}-${operationId.slice(0, 8)}`,
        );
        const tmpDir = join(workspace, 'tmp');
        const outputDir = join(workspace, 'output');
        // Import the new result separately until the scene save is confirmed.
        // Fixed publication follows exact cleanup; this is not an Undo pixel archive.
        const version = `bake-${operationId}`;
        const parentUrl = options.outputUrl ?? `db://assets/${options.sceneName}/lightmap`;
        const parentDir = join(assetRoot, parentUrl.slice('db://assets'.length));
        const targetDir = join(parentDir, version);
        const targetUrl = `${parentUrl}/${version}`;
        const publicationBase = options.outputUrl && options.outputUrl !== 'db://assets' ? options.outputUrl : 'db://assets/LightFX';
        const publicationIdentity = options.sceneUuid
            ? `scene-${Utils.UUID.decompressUUID(options.sceneUuid).split('@', 1)[0]}` : version;
        const operation: LightFXHostOperation = {
            sceneStats: options.sceneStats ? { ...options.sceneStats } : undefined,
            id: operationId,
            target: options.target,
            sceneName: options.sceneName,
            timeoutMs: options.timeoutMs,
            workspace,
            inputPath: join(tmpDir, 'lfx.in'),
            outputDir,
            targetDir,
            targetUrl,
            publicationRootUrl: `${publicationBase}/${publicationIdentity}`,
            refreshUrl: options.outputUrl ?? `db://assets/${options.sceneName}`,
            inputBytes: 0,
            inputWritePromise: Promise.resolve(),
            state: 'accepting-input',
            controller: new AbortController(),
            runner: new LightFXProcess(),
            assets: null,
            assetRecord,
            cleanupPromise: null,
            expiryTimer: null,
            terminalState: null,
        };

        // Reserve the global operation before the first asynchronous filesystem call.
        this.operation = operation;
        this.diagnostics.set(operationId, { owner: { operationId, target: options.target, transactionId: options.transactionId }, value: { version: 1, operationId, stage: 'accepting-input', logs: [] } });
        if (this.diagnostics.size > MAX_REMEMBERED_OPERATIONS) { this.diagnostics.delete(this.diagnostics.keys().next().value!); }
        if (this.sceneOperation) this.sceneOperation.nativeStarted = true;
        try {
            // A corrupt/unreadable record must fail before native work or asset publication.
            await assetRecord?.read();
            if (options.outputUrl !== undefined) {
                const path = relative(await realpath(assetRoot), await realpath(parentDir));
                if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path) || !(await stat(parentDir)).isDirectory()) {
                    throw new Error('Lightmap output directory must be an existing folder inside assets.');
                }
            }
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
        this.diagnostics.get(operation.id)!.value.stage = 'running';
        if (operation.target === 'lightmap') this.appendLightmapLog(operation, 'Baking started');

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
                onLog: message => {
                    if (this.operation !== operation || operation.terminalState) { return; }
                    console.log(`[LightFX] ${message}`);
                    if (operation.target === 'lightmap') {
                        // Product logs are assembled from actual progress/export/output below.
                        // Keep native warnings/errors visible; verbose diagnostics remain in lfx.log.
                        if (/\b(?:error|warning|failed|failure)\b/i.test(message)) this.appendLightmapLog(operation, message);
                        return;
                    }
                    const logs = this.diagnostics.get(operation.id)!.value.logs;
                    logs.push(this.diagnosticText(operation, message));
                    if (logs.length > 128) { logs.shift(); }
                },
                onProgress: progress => {
                    if (this.operation !== operation || operation.terminalState) { return; }
                    const diagnostic = this.diagnostics.get(operation.id)!.value;
                    diagnostic.progress = this.diagnosticText(operation, progress);
                    const rate = parseLightFXProgressRate(progress);
                    if (operation.target === 'lightmap' && rate !== undefined) {
                        this.appendLightmapLog(operation, progress);
                        if (rate === 100) this.lightmapImagesStage(operation);
                    }
                    if (rate === undefined) { delete diagnostic.rate; }
                    else { diagnostic.rate = rate; }
                },
            });
            this.throwIfTerminated(operation);
            const result = decodeLightFXOutput(await readFile(join(operation.outputDir, 'lfx.out')));
            if (operation.target === 'lightmap') {
                this.lightmapImagesStage(operation);
                if (operation.sceneStats) {
                    const { objects, lights, triangles } = operation.sceneStats;
                    this.appendLightmapLog(operation, `Bake scene stats: objects ${objects} lights ${lights} triangles ${triangles}`);
                }
                for (const item of result.meshes) {
                    if (!this.diagnostics.get(operation.id)!.value.logs.some(line => line.startsWith(`Mesh ${item.id}:`))) {
                        this.appendLightmapLog(operation, `Mesh ${item.id}: Index(${item.index}) Offset(${item.offset.join(', ')}) Scale(${item.scale.join(', ')})`);
                    }
                }
                for (const item of result.terrains) {
                    this.appendLightmapLog(operation, `Terrain ${item.id} Block ${item.blockId}: Index(${item.index}) Offset(${item.offset.join(', ')}) Scale(${item.scale.join(', ')})`);
                }
            }
            const textureUrls = operation.target === 'lightmap'
                ? await this.stageLightmapAssets(operation)
                : [];
            this.throwIfTerminated(operation);
            operation.state = 'awaiting-commit';
            this.diagnostics.get(operation.id)!.value.stage = 'awaiting-commit';
            if (operation.target === 'lightmap' && !this.diagnostics.get(operation.id)!.value.logs.includes('End of the baking.')) {
                this.appendLightmapLog(operation, 'End of the baking.');
            }
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
        if (this.sceneOperation) {
            this.sceneOperation.nativeCommitted = true;
            if (operation.target === 'lightmap' && operation.recordedTextureUuids) {
                this.sceneOperation.publication = { operationId: operation.id, textureUuids: operation.recordedTextureUuids,
                    auxiliaryUuids: operation.recordedAuxiliaryUuids ?? [], stagingUrl: operation.targetUrl, rootUrl: operation.publicationRootUrl };
            }
        }
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

    public async publishLightmapAssets(options: IPublishLightmapAssetsOptions): Promise<{ textureUrls: string[] }> {
        this.validateSceneOperation(options?.transactionId, 'lightmap', 'bake');
        const owner = this.sceneOperation;
        const publication = owner?.publication;
        if (!owner?.nativeCommitted || !publication || publication.operationId !== options?.operationId) {
            throw new Error('Lightmap publication requires its committed Bake ownership.');
        }
        if (this.operation || owner.removingAssets) throw new Error('Lightmap asset publication or cleanup is already in progress.');
        owner.removingAssets = true;
        try {
            return { textureUrls: await publishLightmapTextures(this.queryAssetRoot(), publication.textureUuids, publication.stagingUrl, publication.rootUrl, publication.auxiliaryUuids) };
        } finally {
            owner.removingAssets = false;
        }
    }

    public async cancel(options?: ICancelLightFXOperationOptions): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }> {
        const operation = this.operation;
        // Missing/late credentials are a no-op, never a request to cancel whoever is now active.
        // Legacy native callers without a scene reservation must still name their operation.
        if (!operation || !options || options.operationId !== operation.id || options.target !== operation.target
            || options.transactionId !== this.sceneOperation?.transactionId) {
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

    public async removeLightmapAssets(options: IRemoveLightmapAssetsOptions): Promise<IRemoveLightmapAssetsResult> {
        if (this.operation) {
            throw new Error(`A ${this.operation.target} LightFX bake is already in progress.`);
        }
        if (!options || typeof options.sceneUuid !== 'string' || !Array.isArray(options.textureUuids) || options.textureUuids.length > MAX_TEXTURE_SOURCES) {
            throw new Error('Invalid Lightmap texture UUID list.');
        }
        const sceneUuid = Utils.UUID.decompressUUID(options.sceneUuid).split('@', 1)[0];
        if (!Utils.UUID.isUUID(sceneUuid)) throw new Error('Invalid Lightmap scene UUID.');
        const action = options.action ?? 'clear';
        if (action !== 'clear' && action !== 'bake') throw new Error('Invalid Lightmap cleanup action.');
        if (action === 'bake' && (!options.transactionId || !this.sceneOperation?.nativeCommitted)) {
            throw new Error('Lightmap rebake cleanup requires its completed native bake ownership.');
        }
        this.validateSceneOperation(options.transactionId, 'lightmap', action);
        const legacy = options.transactionId === undefined;
        const token = legacy ? await this.reserveSceneOperation({ target: 'lightmap', action: 'clear' }) : { transactionId: options.transactionId! };
        const owner = this.sceneOperation!;
        if (owner.removingAssets) throw new Error('Lightmap assets are already being removed.');
        owner.removingAssets = true;
        try {
            const uuids = [...new Set(options.textureUuids.map(value => {
                if (typeof value !== 'string') throw new Error('Invalid Lightmap texture UUID.');
                const uuid = Utils.UUID.decompressUUID(value).split('@', 1)[0];
                if (!Utils.UUID.isUUID(uuid)) throw new Error('Invalid Lightmap texture UUID.');
                return uuid;
            }))];
            const record = new LightmapAssetRecord(dirname(this.queryAssetRoot()), sceneUuid);
            const recorded = new Set(await record.read());
            // Native files never occur in a Lightmap binding. Their complete membership is
            // host-owned, including retries after Clear already removed all texture bindings.
            const currentAuxiliary = new Set(action === 'bake' ? owner.publication?.auxiliaryUuids ?? [] : []);
            const auxiliary = new Set((await record.readAuxiliary()).filter(uuid => !currentAuxiliary.has(uuid)));
            const candidates = [...new Set([...uuids, ...auxiliary])];
            const infos = new Map(candidates.map(uuid => [uuid, assetManager.queryAssetInfo(uuid)]));
            const managed = (uuid: string): boolean => isImmutableLightmapTexture(infos.get(uuid)?.url)
                || (recorded.has(uuid) && isLightmapTextureUrl(infos.get(uuid)?.url))
                || (auxiliary.has(uuid) && !!infos.get(uuid)?.url?.startsWith('db://assets/')
                    && !!lightmapAuxiliaryPath(infos.get(uuid)!.url!.split('/').at(-1)!));
            const known = uuids.filter(uuid => !auxiliary.has(uuid) && managed(uuid));
            // Include legacy currently-bound candidates before deletion so a retained/failed
            // delete can be retried after the saved scene no longer has any Lightmap binding.
            if (known.length) await record.add(known);
            const result: IRemoveLightmapAssetsResult = { deletedTextureUuids: [], retainedTextureUuids: [], failures: [] };
            const absent: string[] = [];
            if (auxiliary.size) {
                result.deletedAuxiliaryAssetUuids = [];
                result.retainedAuxiliaryAssetUuids = [];
            }
            for (const uuid of candidates) {
                const info = infos.get(uuid);
                // Only an authoritative miss in an initialized, idle Asset DB invalidates
                // membership. Exceptions, startup and refresh gaps must retain the record.
                if (!info && (recorded.has(uuid) || auxiliary.has(uuid)) && assetDBManager?.ready
                    && !assetDBManager.isBusy() && assetManager.queryAssetInfo(uuid) === null) {
                    absent.push(uuid);
                    continue;
                }
                if (!info || !managed(uuid)) {
                    result.failures.push({ uuid, reason: 'Asset is not a managed LightFX texture.' });
                    continue;
                }
                try {
                    // Dependency records name Texture/SpriteFrame subassets exactly. A parent
                    // image with no direct users can still own a texture used by another scene.
                    const identities = new Set<string>([uuid]);
                    const collectSubassets = (asset: IAssetInfo): void => {
                        for (const child of Object.values(asset.subAssets ?? {})) {
                            const childUuid = Utils.UUID.decompressUUID(child.uuid);
                            if (childUuid.split('@', 1)[0] !== uuid || !Utils.UUID.isUUID(childUuid)) {
                                throw new Error('Invalid Lightmap subasset identity; asset retained.');
                            }
                            if (identities.has(childUuid)) continue;
                            identities.add(childUuid);
                            collectSubassets(child);
                        }
                    };
                    collectSubassets(info);
                    const users: string[] = [];
                    for (const identity of identities) users.push(...await assetManager.queryAssetUsers(identity));
                    const hasOtherUser = users.some((user) => {
                        try {
                            const userUuid = Utils.UUID.decompressUUID(user).split('@', 1)[0];
                            return userUuid !== uuid && (auxiliary.has(uuid) || userUuid !== sceneUuid);
                        } catch {
                            // An unknown dependency identifier is retained conservatively.
                            return true;
                        }
                    });
                    if (hasOtherUser) {
                        (auxiliary.has(uuid) ? result.retainedAuxiliaryAssetUuids! : result.retainedTextureUuids).push(uuid);
                        continue;
                    }
                    await assetManager.removeAsset(uuid);
                    if (info.file && await pathExists(info.file)) {
                        throw new Error('Lightmap texture file still exists after asset deletion.');
                    }
                    if (info.file && await pathExists(`${info.file}.meta`)) {
                        throw new Error('Lightmap asset metadata still exists after asset deletion.');
                    }
                    (auxiliary.has(uuid) ? result.deletedAuxiliaryAssetUuids! : result.deletedTextureUuids).push(uuid);
                    if (info.file) await removeEmptyLightmapVersion(this.queryAssetRoot(), dirname(info.url!));
                } catch (error) {
                    result.failures.push({ uuid, reason: error instanceof Error ? error.message : String(error) });
                }
            }
            const deleted = [...result.deletedTextureUuids, ...(result.deletedAuxiliaryAssetUuids ?? []), ...absent];
            if (deleted.length > 0) {
                await record.forget(deleted);
            }
            return result;
        } finally {
            owner.removingAssets = false;
            if (legacy) await this.releaseSceneOperation(token);
        }
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
        if (options.sceneStats !== undefined && (!options.sceneStats ||
            !['objects', 'lights', 'triangles'].every(key => Number.isSafeInteger(options.sceneStats![key as keyof typeof options.sceneStats])
                && options.sceneStats![key as keyof typeof options.sceneStats] >= 0))) {
            throw new Error('Invalid LightFX exported scene statistics.');
        }
        if (options.outputUrl !== undefined) {
            const url = options.outputUrl;
            if (options.target !== 'lightmap' || typeof url !== 'string'
                || (url !== 'db://assets' && !url.startsWith('db://assets/'))
                || (url !== 'db://assets' && url.slice('db://assets/'.length).split('/').some(part =>
                    !part || part === '.' || part === '..' || /[<>:"\\|?*#%]/.test(part)
                    || [...part].some(char => char.charCodeAt(0) < 32) || /[. ]$/.test(part)))) {
                throw new Error('Invalid Lightmap output directory URL; choose an existing folder under db://assets.');
            }
        }
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
        const auxiliaryFiles: string[] = [];
        if (operation.assetRecord && this.sceneOperation) {
            // Copy before native commit cleans the workspace. Flat staging avoids a second
            // directory transaction; publication maps these exact names to Creator's layout.
            for (const file of ['lfx.in', 'lfx.out', 'lfx.log']) {
                const source = join(operation.workspace, lightmapAuxiliaryPath(file)!);
                if (file === 'lfx.log' && !(await pathExists(source))) continue;
                await copy(source, join(operation.targetDir, file), { overwrite: false, errorOnExist: true });
                auxiliaryFiles.push(file);
            }
        }
        await assetManager.refreshAsset(operation.targetUrl);

        const generatedUuids: string[] = [];
        for (const file of files) {
            this.throwIfTerminated(operation);
            const url = `${operation.targetUrl}/${file}`;
            const uuid = await this.waitForAsset(operation, url, Math.min(operation.timeoutMs, 60_000));
            await this.disableAlphaFix(uuid);
            generatedUuids.push(uuid);
        }
        if (operation.assetRecord) {
            const auxiliaryUuids: string[] = [];
            for (const file of auxiliaryFiles) {
                auxiliaryUuids.push(await this.waitForAsset(operation, `${operation.targetUrl}/${file}`, Math.min(operation.timeoutMs, 60_000)));
            }
            await operation.assetRecord.add(generatedUuids, auxiliaryUuids);
            operation.recordedTextureUuids = generatedUuids;
            operation.recordedAuxiliaryUuids = auxiliaryUuids;
            this.throwIfTerminated(operation);
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
        const diagnostic = this.diagnostics.get(operation.id);
        if (diagnostic && !operation.terminalState) { diagnostic.value.stage = state; }
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
                if (operation.recordedTextureUuids) {
                    await operation.assetRecord?.forget([...operation.recordedTextureUuids, ...(operation.recordedAuxiliaryUuids ?? [])]);
                }
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
