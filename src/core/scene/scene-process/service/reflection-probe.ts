'use strict';

import { ChildProcess, spawn } from 'child_process';
import {
    assert,
    assetManager,
    director,
    Director,
    gfx,
    ReflectionProbe,
    renderer,
    TextureCube,
} from 'cc';
import { ReflectionProbeManager } from 'cc/editor/reflection-probe';
import {
    copy,
    ensureDir,
    existsSync,
    outputJson,
    pathExists,
    readJson,
    readdir,
    move,
    remove,
} from 'fs-extra';
import { basename, dirname, join } from 'path';
import type {
    IReflectionProbeBakeOptions,
    IReflectionProbeBakeResult,
    IReflectionProbeEvents,
    IReflectionProbeService,
} from '../../common';
import { NodeEventType } from '../../common';
import { BaseService, register, Service } from './core';
import { ServiceEvents } from './core/global-events';
import { Rpc } from '../rpc';
import { syncSceneEditorBundles } from '../scene-editor-assets';
import { removePreviewAssetCache } from './preview/asset-reload';
import { isReflectionProbeTextureCubeImported } from './reflection-probe-import-state';

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 200;
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

interface IAssetInfo {
    uuid: string;
    url: string;
    [key: string]: unknown;
}

interface ICapturedFaces {
    sceneUrl: string;
    sceneName: string;
    componentUuid: string;
    probeId: number;
    resolution: number;
    fastBake: boolean;
    captureToken: string;
    faces: string[];
    rendererId?: string;
}

interface IApplyBakedCubemapOptions {
    sceneUrl: string;
    nodePath: string;
    componentUuid: string;
    cubemapUuid: string;
    captureToken: string;
    saveScene: boolean;
    timeoutMs: number;
    serverURL?: string;
}

interface IOutputTransaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

@register('ReflectionProbe')
export class ReflectionProbeService extends BaseService<IReflectionProbeEvents> implements IReflectionProbeService {
    private _baking = false;
    private _cmftProcess: ChildProcess | null = null;

    public async bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult> {
        if (this._baking) {
            throw new Error('A reflection probe bake is already in progress.');
        }
        if (!options?.nodePath?.trim()) {
            throw new Error('Reflection probe nodePath is required.');
        }

        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe timeoutMs must be greater than zero.');
        }

        const deadline = Date.now() + timeoutMs;
        const nodePath = options.nodePath.trim();
        this._baking = true;
        this.broadcast('reflection-probe:bake-start', nodePath);

        try {
            const remoteRenderer = gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN;
            const captured = this._validateCapturedFaces(remoteRenderer
                ? await Rpc.getInstance().request('reflectionProbeRenderer', 'captureActive', [
                    nodePath,
                    Math.max(1, deadline - Date.now()),
                ])
                : await this.capturePixels(nodePath, Math.max(1, deadline - Date.now())), remoteRenderer);
            const {
                sceneUrl,
                sceneName,
                componentUuid,
                probeId,
                resolution,
                fastBake,
            } = captured;

            const assetRoot = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string | null;
            if (!assetRoot) {
                throw new Error('The db://assets directory is unavailable.');
            }

            const sceneDir = join(assetRoot, sceneName);
            const backupRoot = join(assetRoot, '..', 'temp', 'reflection-probe-bake');
            const workDir = join(backupRoot, `work-${process.pid}-${Date.now()}-${probeId}`);
            await ensureDir(sceneDir);
            await ensureDir(workDir);
            try {
                await this._cleanupLegacyWorkingFiles(sceneDir, probeId);
                const facePaths = await this._writeFaces(captured.faces, workDir, resolution, deadline);
                const outputBase = join(sceneDir, `reflectionProbe_${probeId}`);
                const outputPath = `${outputBase}.png`;
                const outputUrl = `db://assets/${sceneName}/reflectionProbe_${probeId}.png`;
                const textureCubeUrl = `${outputUrl}/textureCube`;
                const stagedBase = join(workDir, `reflectionProbe_${probeId}`);
                const stagedOutputPath = `${stagedBase}.png`;

                await this._runCmft(facePaths, stagedBase, deadline);
                await this._prepareMeta(stagedOutputPath, fastBake, outputPath);
                const outputTransaction = await this._replaceOutput(
                    stagedOutputPath,
                    outputPath,
                    backupRoot,
                    fastBake,
                );
                try {
                    this._assertBeforeDeadline(deadline, 'asset import');
                    await Rpc.getInstance().request('assetManager', 'refreshAssetOnly', [outputUrl]);
                    if (!fastBake) {
                        await this._ensureConvolution(outputBase, outputUrl, deadline);
                    }
                    await this._waitForTextureCubeImport(outputPath, fastBake, deadline);
                    const cubeInfo = await this._waitForTextureCube(textureCubeUrl, deadline);
                    const applyOptions: IApplyBakedCubemapOptions = {
                        sceneUrl,
                        nodePath,
                        componentUuid,
                        cubemapUuid: cubeInfo.uuid,
                        captureToken: captured.captureToken,
                        saveScene: options.saveScene !== false,
                        timeoutMs: Math.max(1, deadline - Date.now()),
                    };
                    if (remoteRenderer) {
                        await Rpc.getInstance().request('reflectionProbeRenderer', 'apply', [
                            captured.rendererId!,
                            applyOptions,
                            applyOptions.timeoutMs,
                        ]);
                    } else {
                        await this.applyBakedCubemap(applyOptions);
                    }
                    await outputTransaction.commit();
                    this.broadcast('reflection-probe:bake-end', nodePath);
                    return {
                        nodePath,
                        componentUuid,
                        probeId,
                        cubemapUuid: cubeInfo.uuid,
                        cubemapUrl: cubeInfo.url,
                        fastBake,
                    };
                } catch (error) {
                    if (this._isUnknownRemoteApplyState(error)) {
                        // The Webview may still finish binding/saving after the
                        // acknowledgement transport times out. Keep the valid
                        // imported asset so a late save cannot reference a
                        // rolled-back or missing TextureCube.
                        await outputTransaction.commit();
                    } else {
                        await outputTransaction.rollback();
                        await Rpc.getInstance().request('assetManager', 'refreshAssetOnly', [outputUrl]).catch(() => undefined);
                    }
                    throw error;
                }
            } finally {
                await this._removeWithRetry(workDir);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.broadcast('reflection-probe:bake-end', nodePath, message);
            throw error;
        } finally {
            if (this._cmftProcess) {
                this._cmftProcess.kill();
                this._cmftProcess = null;
            }
            this._baking = false;
        }
    }

    /**
     * Runs inside the browser scene client when the Node scene process uses EmptyDevice.
     * Faces are base64 encoded so they can cross socket.io and process IPC unchanged.
     */
    public async capturePixels(nodePath: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ICapturedFaces> {
        if (gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN) {
            throw new Error('Reflection-probe pixels cannot be captured with the headless EmptyDevice.');
        }
        const node = this._getNodeByExactPath(nodePath);
        if (!node) {
            throw new Error(`Reflection probe node was not found in the WebGL scene renderer: ${nodePath}`);
        }
        const component = node.getComponent(ReflectionProbe);
        if (!component) {
            throw new Error(`Node does not contain cc.ReflectionProbe in the WebGL scene renderer: ${nodePath}`);
        }
        if (!component.enabled || !node.activeInHierarchy) {
            throw new Error(`Reflection probe is disabled or inactive: ${nodePath}`);
        }
        if (component.probeType !== renderer.scene.ProbeType.CUBE) {
            throw new Error(`Only cube reflection probes can be baked: ${nodePath}`);
        }
        const resolution = Number((component as any)._resolution);
        if (!Number.isInteger(resolution) || resolution <= 0) {
            throw new Error(`Reflection probe has an invalid resolution: ${resolution}`);
        }

        const sceneName = node.scene?.name;
        if (!sceneName) {
            throw new Error('No scene is currently open in the WebGL scene renderer.');
        }
        const sceneUrl = await this._queryCurrentSceneUrl();
        const captureToken = this._createCaptureToken(node, component);
        const deadline = Date.now() + timeoutMs;
        component.probe.captureCubemap();
        await this._waitForCapture(component.probe, deadline);
        if (this._createCaptureToken(node, component) !== captureToken) {
            throw new Error(`Reflection probe changed during cubemap capture: ${nodePath}`);
        }
        const flip = director.root!.device.capabilities.clipSpaceMinZ === -1;
        return {
            sceneUrl,
            sceneName,
            componentUuid: component.uuid,
            probeId: component.probe.getProbeId(),
            resolution,
            fastBake: component.fastBake,
            captureToken,
            faces: component.probe.bakedCubeTextures.map((texture: unknown) => {
                const pixels = this._readPixels(texture);
                const data = flip ? this._flipImage(pixels, resolution, resolution) : pixels;
                return this._encodeBase64(data);
            }),
        };
    }

    /** Applies an imported TextureCube to the live WebGL scene that captured it. */
    public async applyBakedCubemap(options: IApplyBakedCubemapOptions): Promise<{ applied: true; saved: boolean }> {
        if (gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN) {
            throw new Error('A reflection-probe cubemap can only be applied by a WebGL scene renderer.');
        }
        if (!options?.sceneUrl || !options.nodePath || !options.componentUuid
            || !options.cubemapUuid || !options.captureToken) {
            throw new Error('Invalid reflection-probe apply request.');
        }
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe apply timeoutMs must be greater than zero.');
        }
        const deadline = Date.now() + timeoutMs;
        await this._assertCurrentScene(options.sceneUrl);
        await syncSceneEditorBundles(options.serverURL);
        this._assertBeforeDeadline(deadline, 'TextureCube bundle refresh');
        const textureCube = await this._loadTextureCube(options.cubemapUuid, deadline, true);
        await this._assertCurrentScene(options.sceneUrl);

        const node = this._getNodeByExactPath(options.nodePath);
        const component = node?.getComponent(ReflectionProbe) as ReflectionProbe | null;
        if (!node || !component || component.uuid !== options.componentUuid
            || this._createCaptureToken(node, component) !== options.captureToken) {
            throw new Error(`Reflection probe changed before the baked cubemap could be applied: ${options.nodePath}`);
        }

        const previousCubemap = component.cubemap;
        let sceneSaved = false;
        const commandId = Service.Undo.beginRecording([component.uuid], {
            label: 'Bake reflection probe',
            scope: {
                nodePath: options.nodePath,
                propPath: `_components.${node.components.indexOf(component)}._cubemap`,
                editorType: 'scene',
            },
        });
        try {
            component.cubemap = textureCube;
            this._notifyCubemapChanged(node, component);
            await Service.Engine.repaintInEditMode();
            if (options.saveScene) {
                this._assertBeforeDeadline(deadline, 'scene save');
                await Service.Editor.save({});
                sceneSaved = true;
            }
            await Service.Undo.endRecording(commandId);
            if (options.saveScene) {
                // Editor.save marks the command that existed before this
                // recording was finalized. Advance the saved checkpoint to
                // the newly committed bake command so Pink is not left dirty.
                Service.Undo.markSaved();
            }
            return { applied: true, saved: options.saveScene };
        } catch (error) {
            Service.Undo.cancelRecording(commandId);
            if (sceneSaved) {
                // The scene already references the new TextureCube on disk.
                // Keep both the live binding and the imported asset even if
                // finalizing Undo/dirty state fails after the save completed.
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(
                    'The reflection-probe scene was saved, but the final WebGL apply state is unknown. '
                    + `(${detail})`,
                );
            }
            component.cubemap = previousCubemap;
            try {
                this._notifyCubemapChanged(node, component);
                await Service.Engine.repaintInEditMode();
            } catch {
                // Preserve the original apply/save failure.
            }
            throw error;
        }
    }

    private _validateCapturedFaces(value: unknown, requireRendererId: boolean): ICapturedFaces {
        const captured = value as Partial<ICapturedFaces> | null;
        const validSceneName = typeof captured?.sceneName === 'string'
            && captured.sceneName.length > 0
            && captured.sceneName === basename(captured.sceneName)
            && captured.sceneName !== '.'
            && captured.sceneName !== '..';
        if (
            typeof captured?.sceneUrl !== 'string'
            || captured.sceneUrl.length === 0
            || !validSceneName
            || typeof captured.componentUuid !== 'string'
            || captured.componentUuid.length === 0
            || !Number.isInteger(captured.probeId)
            || (captured.probeId as number) < 0
            || !Number.isInteger(captured.resolution)
            || (captured.resolution as number) <= 0
            || typeof captured.fastBake !== 'boolean'
            || typeof captured.captureToken !== 'string'
            || captured.captureToken.length === 0
            || !Array.isArray(captured.faces)
            || captured.faces.length !== FACE_NAMES.length
            || captured.faces.some((face) => typeof face !== 'string')
            || (requireRendererId && (typeof captured.rendererId !== 'string' || captured.rendererId.length === 0))
        ) {
            throw new Error('The WebGL scene renderer returned invalid reflection-probe data.');
        }
        return captured as ICapturedFaces;
    }

    private _createCaptureToken(node: any, component: ReflectionProbe): string {
        const session = (Service.Editor as any).getEditorSession?.();
        const tuple = (value: any, keys: string[]) => keys.map((key) => Number(value?.[key] ?? 0));
        return JSON.stringify({
            editor: [session?.uuid ?? null, session?.generation ?? null],
            component: component.uuid,
            probeId: component.probe.getProbeId(),
            probeType: component.probeType,
            enabled: component.enabled,
            active: node.activeInHierarchy,
            resolution: Number((component as any)._resolution),
            fastBake: component.fastBake,
            cubemap: component.cubemap?.uuid ?? null,
            clearFlag: (component as any)._clearFlag ?? (component as any).clearFlag,
            visibility: (component as any)._visibility ?? (component as any).visibility,
            backgroundColor: tuple(
                (component as any)._backgroundColor ?? (component as any).backgroundColor,
                ['r', 'g', 'b', 'a'],
            ),
            size: tuple((component as any)._size ?? (component as any).size, ['x', 'y', 'z']),
            position: tuple(node.worldPosition, ['x', 'y', 'z']),
            rotation: tuple(node.worldRotation, ['x', 'y', 'z', 'w']),
            scale: tuple(node.worldScale, ['x', 'y', 'z']),
        });
    }

    private async _queryCurrentSceneUrl(): Promise<string> {
        const current = await Service.Editor.queryCurrent();
        const sceneUrl = ((current as any)?.__identifier__?.assetUrl
            ?? (current as any)?.assetUrl) as string | undefined;
        if (!sceneUrl) {
            throw new Error('The currently opened WebGL scene has no asset URL.');
        }
        return sceneUrl;
    }

    private async _assertCurrentScene(expectedSceneUrl: string): Promise<void> {
        const currentSceneUrl = await this._queryCurrentSceneUrl();
        if (currentSceneUrl !== expectedSceneUrl) {
            throw new Error(
                `The WebGL scene changed during reflection-probe bake: expected ${expectedSceneUrl}, got ${currentSceneUrl}.`,
            );
        }
    }

    private _isUnknownRemoteApplyState(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('final WebGL apply state is unknown');
    }

    private async _waitForCapture(probe: any, deadline: number): Promise<void> {
        do {
            this._assertBeforeDeadline(deadline, 'cubemap capture');
            // Subscribe before requesting a repaint. The browser editor renders
            // on demand, so subscribing afterwards can miss the only frame and
            // leave the bake waiting for an unrelated future repaint.
            const endFrame = this._waitForEndFrame(deadline);
            await Service.Engine.repaintInEditMode();
            await endFrame;
        } while (typeof probe.isFinishedRendering === 'function' && !probe.isFinishedRendering());

        if (!Array.isArray(probe.bakedCubeTextures) || probe.bakedCubeTextures.length !== 6) {
            throw new Error('Reflection probe capture did not produce six render textures.');
        }
    }

    private _getNodeByExactPath(path: string): any | null {
        if (path === '/') {
            return director.getScene();
        }
        const segments = path.split('/').map((segment) => segment.trim()).filter(Boolean);
        let current: any = director.getScene();
        for (const segment of segments) {
            current = current?.children?.find((child: any) => child.name === segment) ?? null;
            if (!current) {
                return null;
            }
        }
        return current;
    }

    private _waitForEndFrame(deadline: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                reject(new Error('Reflection probe bake timed out during cubemap capture.'));
                return;
            }
            const timer = setTimeout(() => {
                director.off(Director.EVENT_END_FRAME, onFrame);
                reject(new Error('Reflection probe bake timed out during cubemap capture.'));
            }, remaining);
            const onFrame = () => {
                clearTimeout(timer);
                resolve();
            };
            director.once(Director.EVENT_END_FRAME, onFrame);
        });
    }

    private async _writeFaces(
        faces: string[],
        workDir: string,
        resolution: number,
        deadline: number,
    ): Promise<string[]> {
        const result: string[] = [];
        try {
            // Keep sharp out of the browser service initialization path. Its
            // libvips bootstrap is Node-only and crashes the WebGL scene client.
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
            for (let i = 0; i < FACE_NAMES.length; i++) {
                this._assertBeforeDeadline(deadline, 'render texture readback');
                const data = decodedFaces[i];
                const facePath = join(workDir, `${FACE_NAMES[i]}.png`);
                result.push(facePath);
                await sharp(data, {
                    raw: { width: resolution, height: resolution, channels: 4 },
                }).png().toFile(facePath);
            }
            return result;
        } catch (error) {
            await Promise.all(result.map(async (path) => remove(path).catch(() => undefined)));
            throw error;
        }
    }

    private _readPixels(texture: any): Uint8Array {
        const gfxTexture = texture?.getGFXTexture?.();
        if (!gfxTexture) {
            throw new Error('Failed to access a reflection probe render texture.');
        }
        const width = texture.width;
        const height = texture.height;
        const buffer = new Uint8Array(width * height * 4);
        const region = new gfx.BufferTextureCopy();
        region.texExtent.width = width;
        region.texExtent.height = height;
        gfx.deviceManager.gfxDevice.copyTextureToBuffers(gfxTexture, [buffer], [region]);
        return buffer;
    }

    private _flipImage(data: Uint8Array, width: number, height: number): Uint8Array {
        const result = new Uint8Array(data.length);
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
            result.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), (height - y - 1) * rowBytes);
        }
        return result;
    }

    private _encodeBase64(data: Uint8Array): string {
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < data.length; offset += chunkSize) {
            binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
    }

    private async _runCmft(facePaths: string[], outputBase: string, deadline: number): Promise<void> {
        const executable = this._resolveCmftExecutable();
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
            const child = this._cmftProcess = spawn(executable, args, { windowsHide: true });
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
                this._cmftProcess = null;
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

    private _resolveCmftExecutable(): string {
        const suffix = process.platform === 'win32' ? '.exe' : '';
        // This service is also bundled for the browser WebGL renderer. Resolve
        // the Node-only static path lazily so browser module initialization does
        // not import GlobalPaths (which relies on __dirname).
        const staticDir = join(__dirname, '../../../../../static');
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

    private async _prepareMeta(outputPath: string, fastBake: boolean, previousOutputPath?: string): Promise<void> {
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

    private async _replaceOutput(
        stagedOutputPath: string,
        outputPath: string,
        backupRoot: string,
        fastBake: boolean,
    ): Promise<IOutputTransaction> {
        await this._cleanupLegacyBackupMetas(outputPath);
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
            for (let i = 0; i < targets.length; i++) {
                if (await pathExists(targets[i])) {
                    await copy(targets[i], backups[i], { overwrite: false });
                    savedBackups.push({ target: targets[i], backup: backups[i] });
                }
            }
            if (fastBake) {
                await remove(`${outputBase}_convolution`).catch(() => undefined);
            } else {
                // Preserve AssetDB-generated meta files and their UUIDs while
                // invalidating only the six stale convolution images.
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
            commit: async () => {
                await remove(backupDir).catch(() => undefined);
            },
            rollback: restore,
        };
    }

    private async _cleanupLegacyBackupMetas(outputPath: string): Promise<void> {
        const prefix = `${basename(outputPath)}.bake-backup-`;
        const entries = await readdir(dirname(outputPath)).catch(() => []);
        await Promise.all(entries
            .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.meta'))
            .map(async (entry) => this._removeWithRetry(join(dirname(outputPath), entry))));
    }

    private async _cleanupLegacyWorkingFiles(sceneDir: string, probeId: number): Promise<void> {
        const prefix = `.reflection-probe-${probeId}-`;
        const entries = await readdir(sceneDir).catch(() => []);
        await Promise.all(entries.filter((entry) => {
            if (!entry.startsWith(prefix)) {
                return false;
            }
            const suffix = entry.slice(prefix.length);
            return FACE_NAMES.some((face) => suffix === `${face}.png` || suffix === `${face}.png.meta`)
                || /^\d+\.png(?:\.meta)?$/.test(suffix);
        }).map(async (entry) => this._removeWithRetry(join(sceneDir, entry))));
    }

    private _notifyCubemapChanged(node: any, component: ReflectionProbe): void {
        ReflectionProbeManager.probeManager.updateBakedCubemap(component.probe);
        ReflectionProbeManager.probeManager.updatePreviewSphere(component.probe);
        ServiceEvents.emit('node:change', node, {
            type: NodeEventType.SET_PROPERTY,
            propPath: `_components.${node.components.indexOf(component)}._cubemap`,
        });
    }

    private async _ensureConvolution(outputBase: string, outputUrl: string, deadline: number): Promise<void> {
        const convolutionDir = `${outputBase}_convolution`;
        if (!await this._hasCompleteConvolution(convolutionDir)) {
            // A brand-new PNG is imported in two stages: the image importer
            // first creates the TextureCube subasset, then erp-texture-cube can
            // run its convolution importer on the following refresh.
            this._assertBeforeDeadline(deadline, 'texture cube convolution');
            await this._prepareMeta(`${outputBase}.png`, false);
            await Rpc.getInstance().request('assetManager', 'refreshAssetOnly', [outputUrl]);
        }
        while (Date.now() < deadline) {
            if (await this._hasCompleteConvolution(convolutionDir)) {
                return;
            }
            await this._delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        throw new Error(`TextureCube convolution mipmaps were not generated before timeout: ${outputUrl}`);
    }

    private async _hasCompleteConvolution(convolutionDir: string): Promise<boolean> {
        return (await Promise.all(FACE_NAMES.map((_face, index) => (
            pathExists(join(convolutionDir, `mipmap_${index}.png`))
        )))).every(Boolean);
    }

    private async _waitForTextureCubeImport(
        outputPath: string,
        fastBake: boolean,
        deadline: number,
    ): Promise<void> {
        const metaPath = `${outputPath}.meta`;
        while (Date.now() < deadline) {
            try {
                const meta = await readJson(metaPath);
                if (isReflectionProbeTextureCubeImported(meta, fastBake ? 1 : 2)) {
                    return;
                }
            } catch {
                // AssetDB may be replacing the meta file while an import is in progress.
            }
            await this._delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        throw new Error(`TextureCube and its six faces were not fully imported before timeout: ${metaPath}`);
    }

    private async _waitForTextureCube(url: string, deadline: number): Promise<IAssetInfo> {
        let lastError: unknown;
        while (Date.now() < deadline) {
            try {
                const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [url]) as IAssetInfo | null;
                if (info?.uuid) {
                    return info;
                }
            } catch (error) {
                lastError = error;
            }
            await this._delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
        throw new Error(`TextureCube subasset was not imported before timeout: ${url}.${detail}`);
    }

    private async _loadTextureCube(uuid: string, deadline: number, reloadAsset = false): Promise<TextureCube> {
        if (reloadAsset) {
            removePreviewAssetCache(uuid);
        }
        while (Date.now() < deadline) {
            const remaining = deadline - Date.now();
            const asset = await new Promise<TextureCube | null | 'timeout'>((resolve) => {
                let settled = false;
                const timer = setTimeout(() => {
                    settled = true;
                    resolve('timeout');
                }, remaining);
                const done = (error: Error | null, value: TextureCube) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    resolve(error ? null : value);
                };
                if (reloadAsset) {
                    assetManager.loadAny(uuid, { reloadAsset: true }, done);
                } else {
                    assetManager.loadAny(uuid, done);
                }
            });
            if (asset === 'timeout') {
                break;
            }
            if (asset instanceof TextureCube) {
                return asset;
            }
            await this._delay(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        throw new Error(`TextureCube could not be loaded before timeout: ${uuid}`);
    }

    private _assertBeforeDeadline(deadline: number, stage: string): void {
        assert(Date.now() < deadline, `Reflection probe bake timed out during ${stage}.`);
    }

    private _delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async _removeWithRetry(path: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await remove(path);
                return;
            } catch {
                if (attempt < 2) {
                    await this._delay(50 * (attempt + 1));
                }
            }
        }
    }
}
