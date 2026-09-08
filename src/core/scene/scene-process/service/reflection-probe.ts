'use strict';

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
import { basename } from 'path';
import type {
    IPreparedReflectionProbeBake,
    IReflectionProbeCapturedFaces,
} from '../../common/reflection-probe-host';
import type {
    IReflectionProbeBakeAllOptions,
    IReflectionProbeBakeAllResult,
    IReflectionProbeBakeFailure,
    IReflectionProbeBakeOptions,
    IReflectionProbeBakeResult,
    IReflectionProbeClearFailure,
    IReflectionProbeClearOptions,
    IReflectionProbeClearResult,
    IReflectionProbeEvents,
    IReflectionProbeService,
    IReflectionProbeSceneIdentity,
    IReflectionProbeTaskState,
} from '../../common';
import { NodeEventType } from '../../common';
import { BaseService, register, Service } from './core';
import type { IEditorSessionService } from './core/editor-session';
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

type ICapturedFaces = IReflectionProbeCapturedFaces;

interface IApplyBakedCubemapOptions {
    source?: IReflectionProbeSceneIdentity;
    sceneUrl: string;
    nodePath: string;
    componentUuid: string;
    cubemapUuid: string;
    captureToken: string;
    saveScene: boolean;
    timeoutMs: number;
    serverURL?: string;
}

interface IReflectionProbeDescriptor {
    nodePath: string;
    componentUuid: string;
}

interface IRemoteRendererSelection {
    source?: IReflectionProbeSceneIdentity;
    rendererId: string;
    sceneUrl: string;
}

interface IActiveRendererProbeList extends IRemoteRendererSelection {
    probes: IReflectionProbeDescriptor[];
}

interface IReflectionProbeBakedDescriptor extends IReflectionProbeDescriptor {
    probeId: number;
    cubemapUuid: string;
}

interface IClearBakedCubemapsOptions {
    source?: IReflectionProbeSceneIdentity;
    sceneUrl: string;
    saveScene: boolean;
    timeoutMs?: number;
}

interface IClearBakedCubemapsResult {
    sceneUrl: string;
    sceneName: string;
    probes: IReflectionProbeBakedDescriptor[];
    clearedCount: number;
    saved: boolean;
}

interface IGeneratedProbeAsset {
    outputUrl: string;
    convolutionUrl: string;
}

@register('ReflectionProbe')
export class ReflectionProbeService extends BaseService<IReflectionProbeEvents> implements IReflectionProbeService {
    private _task: IReflectionProbeTaskState = this._idleTask();
    private _baking = false;

    private _idleTask(): IReflectionProbeTaskState {
        return { taskId: null, status: 'idle', remaining: [], total: 0, completed: 0, results: [], failures: [] };
    }

    public async getTaskState(source?: IReflectionProbeSceneIdentity): Promise<IReflectionProbeTaskState> {
        if (source) {
            this.assertSceneIdentity(source);
            const owner = this._task.source;
            if (!owner || owner.runtimeId !== source.runtimeId || owner.sceneUuid !== source.sceneUuid || owner.generation !== source.generation) {
                return { ...this._idleTask(), source: { ...source } };
            }
        }
        return structuredClone(this._task);
    }

    private readonly _runtimeId = globalThis.crypto.randomUUID();

    public async getSceneIdentity(): Promise<IReflectionProbeSceneIdentity> {
        return this._getSceneIdentity();
    }

    private _getSceneIdentity(): IReflectionProbeSceneIdentity {
        const editor = Service.Editor as typeof Service.Editor & IEditorSessionService;
        const session = editor.getEditorSession();
        if (!session.uuid || !editor.isCurrentEditorSession(session)) {
            throw new Error('No scene is currently open for reflection-probe baking.');
        }
        return { runtimeId: this._runtimeId, sceneUuid: session.uuid, generation: session.generation };
    }

    public assertSceneIdentity(source: IReflectionProbeSceneIdentity): void {
        const current = this._getSceneIdentity();
        if (source.runtimeId !== current.runtimeId || source.sceneUuid !== current.sceneUuid || source.generation !== current.generation) {
            throw new Error('The WebGL scene changed during reflection-probe bake (stale runtime or generation).');
        }
    }


    public bake(options: IReflectionProbeBakeOptions): Promise<IReflectionProbeBakeResult> {
        return this._runExclusive(() => this._bakeOne(options), 'baking', options.source);
    }

    public bakeAll(options: IReflectionProbeBakeAllOptions = {}): Promise<IReflectionProbeBakeAllResult> {
        return this._runExclusive(() => this._bakeAll(options), 'baking', options.source);
    }

    public clearAll(options: IReflectionProbeClearOptions = {}): Promise<IReflectionProbeClearResult> {
        return this._runExclusive(() => this._clearAll(options), 'clearing', options.source);
    }

    private async _bakeOne(
        options: IReflectionProbeBakeOptions,
        selection?: IRemoteRendererSelection & { componentUuid: string },
    ): Promise<IReflectionProbeBakeResult> {
        if (!options?.nodePath?.trim()) {
            throw new Error('Reflection probe nodePath is required.');
        }

        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe timeoutMs must be greater than zero.');
        }

        const deadline = Date.now() + timeoutMs;
        const nodePath = options.nodePath.trim();
        this._task.current = { nodePath, componentUuid: selection?.componentUuid ?? '' };
        this._task.total = Math.max(1, this._task.total);
        this.broadcast('reflection-probe:bake-start', nodePath);

        try {
            const remoteRenderer = gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN;
            const source = options.source ?? selection?.source ?? (remoteRenderer ? undefined : this._getSceneIdentity());
            if (!remoteRenderer && source) { this.assertSceneIdentity(source); }
            const captureTimeoutMs = Math.max(1, deadline - Date.now());
            const captured = this._validateCapturedFaces(remoteRenderer
                ? await Rpc.getInstance().request(
                    'reflectionProbeRenderer',
                    selection ? 'captureSelected' : 'captureActive',
                    selection
                        ? [selection.rendererId, selection.sceneUrl, nodePath, selection.componentUuid, captureTimeoutMs, source]
                        : [nodePath, captureTimeoutMs, source],
                )
                : await this.capturePixels(nodePath, captureTimeoutMs, selection?.componentUuid, source), remoteRenderer);
            const {
                sceneUrl,
                componentUuid,
                probeId,
                fastBake,
            } = captured;

            this._task.current = { nodePath, componentUuid };
            const prepared = await Rpc.getInstance().request(
                'reflectionProbeBakeHost',
                'prepare',
                [{ captured, timeoutMs: Math.max(1, deadline - Date.now()) }],
            ) as IPreparedReflectionProbeBake;
            try {
                if (!remoteRenderer && source) { this.assertSceneIdentity(source); }
                const applyOptions: IApplyBakedCubemapOptions = {
                    source,
                    sceneUrl,
                    nodePath,
                    componentUuid,
                    cubemapUuid: prepared.cubemapUuid,
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
                await Rpc.getInstance().request('reflectionProbeBakeHost', 'commit', [{
                    operationId: prepared.operationId,
                }]);
                this.broadcast('reflection-probe:bake-end', nodePath);
                const result = {
                    nodePath,
                    componentUuid,
                    probeId,
                    cubemapUuid: prepared.cubemapUuid,
                    cubemapUrl: prepared.cubemapUrl,
                    fastBake,
                };
                this._task.results.push(result);
                this._task.completed++;
                return result;
            } catch (error) {
                if (this._isUnknownRemoteApplyState(error)) {
                    // The Webview may still finish binding/saving after the acknowledgement transport
                    // times out. Keep the imported asset so a late save cannot reference a missing cube.
                    await Rpc.getInstance().request('reflectionProbeBakeHost', 'commit', [{
                        operationId: prepared.operationId,
                    }]);
                } else {
                    await Rpc.getInstance().request('reflectionProbeBakeHost', 'rollback', [{
                        operationId: prepared.operationId,
                    }]);
                }
                throw error;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.broadcast('reflection-probe:bake-end', nodePath, message);
            throw error;
        }
    }

    private async _bakeAll(options: IReflectionProbeBakeAllOptions): Promise<IReflectionProbeBakeAllResult> {
        if (options.componentUuids !== undefined && (
            !Array.isArray(options.componentUuids) || !options.componentUuids.length
            || options.componentUuids.some((uuid) => typeof uuid !== 'string' || !uuid.trim())
            || options.nodePaths !== undefined
        )) {
            throw new Error('A non-empty componentUuids selection is required and cannot be combined with nodePaths.');
        }
        const started = Date.now();
        const timeoutMs = options.timeoutMs ?? 600_000;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe batch timeoutMs must be greater than zero.');
        }
        const deadline = started + timeoutMs;
        const remoteRenderer = gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN;
        const source = options.source ?? (remoteRenderer ? undefined : this._getSceneIdentity());
        if (!remoteRenderer && source) { this.assertSceneIdentity(source); }
        const active = remoteRenderer
            ? await Rpc.getInstance().request('reflectionProbeRenderer', 'listActive', [
                Math.max(1, deadline - Date.now()), options.source,
            ]) as IActiveRendererProbeList
            : {
                rendererId: '', source,
                sceneUrl: await this._queryCurrentSceneUrl(),
                probes: this.listBakeableProbes(),
            };
        const requestedPaths = [...new Set((options.nodePaths ?? []).map((path) => path.trim()).filter(Boolean))];
        const requestedSet = new Set(requestedPaths);
        const selectedUuids = options.componentUuids ? new Set(options.componentUuids.map((uuid) => uuid.trim())) : undefined;
        const probes = selectedUuids
            ? active.probes.filter((probe) => selectedUuids.has(probe.componentUuid))
            : requestedPaths.length
                ? active.probes.filter((probe) => requestedSet.has(probe.nodePath))
                : active.probes;
        const failures: IReflectionProbeBakeFailure[] = selectedUuids
            ? [...selectedUuids].filter((uuid) => !probes.some((probe) => probe.componentUuid === uuid))
                .map((componentUuid) => ({ nodePath: '', componentUuid, reason: 'No active cube reflection probe with this component UUID exists in the source scene.' }))
            : requestedPaths.filter((path) => !active.probes.some((probe) => probe.nodePath === path))
                .map((nodePath) => ({ nodePath, reason: 'Reflection probe node was not found in the active scene.' }));
        const totalCount = probes.length + failures.length;
        if (!totalCount) {
            throw new Error('No active cube reflection probes were found in the current scene.');
        }

        const results: IReflectionProbeBakeResult[] = [];
        this._task.total = totalCount;
        this._task.remaining = probes.slice();
        this.broadcast('reflection-probe:bake-all-start', totalCount);
        try {
            let completedCount = 0;
            for (const failure of failures) {
                completedCount += 1;
                this._task.completed = completedCount;
                this._task.failures = failures.slice();
                this._task.results = results.slice();
                this.broadcast(
                    'reflection-probe:bake-all-progress',
                    completedCount,
                    totalCount,
                    failure.nodePath,
                    failure.reason,
                );
            }
            for (const probe of probes) {
                this._task.remaining.shift();
                let errorMessage: string | undefined;
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    errorMessage = 'Reflection probe batch timed out.';
                } else {
                    try {
                        results.push(await this._bakeOne({
                            nodePath: probe.nodePath,
                            saveScene: false,
                            timeoutMs: remaining,
                        }, {
                            rendererId: active.rendererId,
                            sceneUrl: active.sceneUrl,
                            componentUuid: probe.componentUuid,
                            source: active.source,
                        }));
                    } catch (error) {
                        if (this._isBatchFatalError(error)) {
                            throw error;
                        }
                        errorMessage = this._errorMessage(error);
                    }
                }
                if (errorMessage) {
                    failures.push({
                        nodePath: probe.nodePath,
                        componentUuid: probe.componentUuid,
                        reason: errorMessage,
                    });
                }
                completedCount += 1;
                this._task.completed = completedCount;
                this._task.failures = failures.slice();
                this._task.results = results.slice();
                this.broadcast(
                    'reflection-probe:bake-all-progress',
                    completedCount,
                    totalCount,
                    probe.nodePath,
                    errorMessage,
                );
            }

            if (results.length && options.saveScene !== false) {
                this._assertBeforeDeadline(deadline, 'batch scene save');
                if (remoteRenderer) {
                    await Rpc.getInstance().request('reflectionProbeRenderer', 'save', [
                        active.rendererId,
                        active.sceneUrl,
                        Math.max(1, deadline - Date.now()), active.source,
                    ]);
                } else {
                    if (source) { this.assertSceneIdentity(source); }
                    await Service.Editor.save({});
                    Service.Undo.markSaved();
                }
            }

            this.broadcast('reflection-probe:bake-all-end', results.length, failures.length);
            return {
                sceneUrl: active.sceneUrl,
                totalCount,
                bakedCount: results.length,
                failedCount: failures.length,
                results,
                failures,
                durationMs: Date.now() - started,
            };
        } catch (error) {
            this.broadcast(
                'reflection-probe:bake-all-end',
                results.length,
                failures.length,
                this._errorMessage(error),
            );
            throw error;
        }
    }

    private async _clearAll(options: IReflectionProbeClearOptions): Promise<IReflectionProbeClearResult> {
        const started = Date.now();
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe clear timeoutMs must be greater than zero.');
        }
        if (options.saveScene === false && options.deleteAssets !== false) {
            throw new Error('deleteAssets requires saveScene so the saved scene cannot retain deleted cubemap references.');
        }
        const deadline = started + timeoutMs;
        const remoteRenderer = gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN;
        const failures: IReflectionProbeClearFailure[] = [];
        const deletedAssetUrls: string[] = [];
        const source = options.source ?? (remoteRenderer ? undefined : this._getSceneIdentity());
        if (!remoteRenderer && source) { this.assertSceneIdentity(source); }
        const sceneUrl = remoteRenderer ? '' : await this._queryCurrentSceneUrl();
        this._assertClearBeforeDeadline(deadline, 'scene update');
        const cleared = remoteRenderer
            ? await Rpc.getInstance().request('reflectionProbeRenderer', 'clearActive', [
                options.saveScene !== false,
                Math.max(1, deadline - Date.now()), source,
            ]) as IClearBakedCubemapsResult
            : await this.clearBakedCubemaps({
                sceneUrl,
                source,
                saveScene: options.saveScene !== false,
                timeoutMs: Math.max(1, deadline - Date.now()),
            });
        const generatedAssets = options.deleteAssets === false
            ? []
            : await this._resolveGeneratedProbeAssets(cleared.sceneName, cleared.probes);

        for (const asset of generatedAssets) {
            for (const assetUrl of [asset.convolutionUrl, asset.outputUrl]) {
                try {
                    this._assertClearBeforeDeadline(deadline, 'asset deletion');
                    const info = await Rpc.getInstance().request(
                        'assetManager',
                        'queryAssetInfo',
                        [assetUrl],
                    ) as IAssetInfo | null;
                    if (!info) {
                        continue;
                    }
                    await Rpc.getInstance().request('assetManager', 'removeAsset', [assetUrl]);
                    deletedAssetUrls.push(assetUrl);
                } catch (error) {
                    failures.push({ assetUrl, reason: this._errorMessage(error) });
                }
            }
        }

        return {
            sceneUrl: cleared.sceneUrl,
            totalCount: cleared.probes.length,
            clearedCount: cleared.clearedCount,
            deletedAssetUrls,
            failures,
            durationMs: Date.now() - started,
        };
    }

    /**
     * Runs inside the browser scene client when the Node scene process uses EmptyDevice.
     * Faces are base64 encoded so they can cross socket.io and process IPC unchanged.
     */
    public listBakeableProbes(): IReflectionProbeDescriptor[] {
        const scene = director.getScene();
        if (!scene) {
            throw new Error('No scene is currently open in the WebGL scene renderer.');
        }
        const probes: IReflectionProbeDescriptor[] = [];
        const visit = (node: any, nodePath: string): void => {
            const component = node.getComponent?.(ReflectionProbe) as ReflectionProbe | null;
            if (component?.enabled && node.activeInHierarchy
                && component.probeType === renderer.scene.ProbeType.CUBE) {
                probes.push({ nodePath, componentUuid: component.uuid });
            }
            for (const child of node.children ?? []) {
                visit(child, nodePath === '/' ? child.name : `${nodePath}/${child.name}`);
            }
        };
        visit(scene, '/');
        return probes;
    }

    /** Returns every probe that currently owns a baked cubemap binding, including inactive probes. */
    public listBakedProbes(): { sceneName: string; probes: IReflectionProbeBakedDescriptor[] } {
        const scene = director.getScene();
        if (!scene) {
            throw new Error('No scene is currently open in the WebGL scene renderer.');
        }
        const probes: IReflectionProbeBakedDescriptor[] = [];
        const visit = (node: any, nodePath: string): void => {
            const component = node.getComponent?.(ReflectionProbe) as ReflectionProbe | null;
            const cubemapUuid = component?.cubemap?.uuid;
            if (component && typeof cubemapUuid === 'string' && cubemapUuid) {
                probes.push({
                    nodePath,
                    componentUuid: component.uuid,
                    probeId: component.probe.getProbeId(),
                    cubemapUuid,
                });
            }
            for (const child of node.children ?? []) {
                visit(child, nodePath === '/' ? child.name : `${nodePath}/${child.name}`);
            }
        };
        visit(scene, '/');
        return { sceneName: scene.name, probes };
    }

    /** Atomically clears bindings in the live renderer and optionally saves that same scene. */
    public async clearBakedCubemaps(
        options: IClearBakedCubemapsOptions,
    ): Promise<IClearBakedCubemapsResult> {
        if (!options?.sceneUrl) {
            throw new Error('Invalid reflection-probe clear request.');
        }
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('Reflection probe clear timeoutMs must be greater than zero.');
        }
        const deadline = Date.now() + timeoutMs;
        if (options.source) { this.assertSceneIdentity(options.source); }
        await this._assertCurrentScene(options.sceneUrl);
        const state = this.listBakedProbes();
        if (!state.probes.length) {
            return {
                sceneUrl: options.sceneUrl,
                sceneName: state.sceneName,
                probes: [],
                clearedCount: 0,
                saved: false,
            };
        }

        const targets = state.probes.map((probe) => {
            const located = this._findProbeByUuid(probe.componentUuid);
            if (!located?.component.cubemap?.uuid || located.component.cubemap.uuid !== probe.cubemapUuid) {
                throw new Error(`Reflection probe changed before its baked cubemap could be cleared: ${probe.componentUuid}`);
            }
            return {
                ...located,
                previousCubemap: located.component.cubemap,
            };
        });
        let sceneSaved = false;
        try {
            for (const { node, component } of targets) {
                component.cubemap = null;
                this._notifyCubemapChanged(node, component);
            }
            await Service.Engine.repaintInEditMode();
            if (options.saveScene) {
                if (options.source) { this.assertSceneIdentity(options.source); }
                this._assertClearBeforeDeadline(deadline, 'scene save');
                await Service.Editor.save({});
                sceneSaved = true;
                Service.Undo.markSaved();
            }
            return {
                sceneUrl: options.sceneUrl,
                sceneName: state.sceneName,
                probes: state.probes,
                clearedCount: targets.length,
                saved: options.saveScene,
            };
        } catch (error) {
            if (sceneSaved) {
                const detail = this._errorMessage(error);
                throw new Error(
                    'The reflection-probe scene was saved, but the final WebGL clear state is unknown. '
                    + `(${detail})`,
                );
            }
            for (const { node, component, previousCubemap } of targets) {
                component.cubemap = previousCubemap;
                this._notifyCubemapChanged(node, component);
            }
            await Service.Engine.repaintInEditMode().catch(() => undefined);
            throw error;
        }
    }

    public async capturePixels(
        nodePath: string,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        componentUuid?: string,
        source?: IReflectionProbeSceneIdentity,
    ): Promise<ICapturedFaces> {
        if (gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN) {
            throw new Error('Reflection-probe pixels cannot be captured with the headless EmptyDevice.');
        }
        const captureSource = source ?? this._getSceneIdentity();
        this.assertSceneIdentity(captureSource);
        const located = componentUuid ? this._findProbeByUuid(componentUuid) : null;
        const node = located?.node ?? this._getNodeByExactPath(nodePath);
        if (!node) {
            throw new Error(`Reflection probe node was not found in the WebGL scene renderer: ${nodePath}`);
        }
        const component = located?.component ?? node.getComponent(ReflectionProbe);
        if (!component) {
            throw new Error(`Node does not contain cc.ReflectionProbe in the WebGL scene renderer: ${nodePath}`);
        }
        if (componentUuid && component.uuid !== componentUuid) {
            throw new Error(`Reflection probe component was not found in the WebGL scene renderer: ${componentUuid}`);
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
        this.assertSceneIdentity(captureSource);
        const captureToken = this._createCaptureToken(node, component);
        const deadline = Date.now() + timeoutMs;
        component.probe.captureCubemap();
        await this._waitForCapture(component.probe, deadline);
        this.assertSceneIdentity(captureSource);
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
        if (options.source) { this.assertSceneIdentity(options.source); }
        await this._assertCurrentScene(options.sceneUrl);
        await syncSceneEditorBundles(options.serverURL);
        this._assertBeforeDeadline(deadline, 'TextureCube bundle refresh');
        const textureCube = await this._loadTextureCube(options.cubemapUuid, deadline, true);
        if (options.source) { this.assertSceneIdentity(options.source); }
        await this._assertCurrentScene(options.sceneUrl);

        const located = this._findProbeByUuid(options.componentUuid);
        const node = located?.node;
        const component = located?.component;
        if (!node || !component
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
                if (options.source) { this.assertSceneIdentity(options.source); }
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
            runtime: this._runtimeId,
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

    private _isBatchFatalError(error: unknown): boolean {
        const message = this._errorMessage(error);
        return this._isUnknownRemoteApplyState(error)
            || message.includes('selected for the reflection-probe batch is no longer available')
            || message.includes('that captured the reflection probe is no longer connected')
            || message.includes('WebGL scene changed during reflection-probe bake')
            || message.includes('is not displaying the requested scene');
    }

    private async _runExclusive<T>(
        operation: () => Promise<T>, status: 'baking' | 'clearing', source?: IReflectionProbeSceneIdentity,
    ): Promise<T> {
        if (this._baking) {
            throw new Error('A reflection probe bake or clear is already in progress.');
        }
        const owner = source ?? (gfx.deviceManager.gfxDevice.gfxAPI === gfx.API.UNKNOWN ? undefined : this._getSceneIdentity());
        if (owner) { this.assertSceneIdentity(owner); }
        this._baking = true;
        this._task = { ...this._idleTask(), taskId: globalThis.crypto.randomUUID(), source: owner, status };
        try {
            const result = await operation();
            this._task.status = this._task.failures.length ? 'failed' : 'completed';
            return result;
        } catch (error) {
            this._task.status = 'failed';
            this._task.error = this._errorMessage(error);
            throw error;
        } finally {
            this._task.current = undefined;
            this._task.remaining = [];
            this._baking = false;
        }
    }

    private _errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private async _resolveGeneratedProbeAssets(
        sceneName: string,
        probes: IReflectionProbeBakedDescriptor[],
    ): Promise<IGeneratedProbeAsset[]> {
        if (!sceneName || sceneName !== basename(sceneName) || sceneName === '.' || sceneName === '..') {
            throw new Error('The active scene has an invalid name for reflection-probe asset cleanup.');
        }
        const result: IGeneratedProbeAsset[] = [];
        for (const probe of probes) {
            const separator = probe.cubemapUuid.indexOf('@');
            const rootUuid = separator < 0 ? probe.cubemapUuid : probe.cubemapUuid.slice(0, separator);
            const info = await Rpc.getInstance().request(
                'assetManager',
                'queryAssetInfo',
                [rootUuid],
            ) as IAssetInfo | null;
            const outputUrl = `db://assets/${sceneName}/reflectionProbe_${probe.probeId}.png`;
            if (info?.url !== outputUrl) {
                // The probe references a user-owned cubemap rather than the conventional bake output.
                continue;
            }
            result.push({
                outputUrl,
                convolutionUrl: outputUrl.slice(0, -'.png'.length) + '_convolution',
            });
        }
        return result;
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

    private _findProbeByUuid(componentUuid: string): { node: any; component: ReflectionProbe } | null {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }
        const visit = (node: any): { node: any; component: ReflectionProbe } | null => {
            const component = node.getComponent?.(ReflectionProbe) as ReflectionProbe | null;
            if (component?.uuid === componentUuid) {
                return { node, component };
            }
            for (const child of node.children ?? []) {
                const found = visit(child);
                if (found) {
                    return found;
                }
            }
            return null;
        };
        return visit(scene);
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

    private _notifyCubemapChanged(node: any, component: ReflectionProbe): void {
        ReflectionProbeManager.probeManager.updateBakedCubemap(component.probe);
        ReflectionProbeManager.probeManager.updatePreviewSphere(component.probe);
        ServiceEvents.emit('node:change', node, {
            type: NodeEventType.SET_PROPERTY,
            propPath: `_components.${node.components.indexOf(component)}._cubemap`,
        });
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

    private _assertClearBeforeDeadline(deadline: number, stage: string): void {
        assert(Date.now() < deadline, `Reflection probe clear timed out during ${stage}.`);
    }

    private _delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

}
