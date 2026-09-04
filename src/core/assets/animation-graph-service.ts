import { createHash, randomUUID } from 'crypto';
import { readFile, stat } from 'fs-extra';

import type { IAsset } from './@types/protected';
import type {
    AnimationGraphChangedEvent,
    AnimationGraphCommand,
    AnimationGraphExpectedVersion,
    AnimationGraphInspectorPropertyCapabilities,
    AnimationGraphInspectorPropertyOperationRequest,
    AnimationGraphInspectorSnapshot,
    AnimationGraphLayerView,
    AnimationGraphMotionType,
    AnimationGraphMotionView,
    AnimationGraphPoseGraphAssetDragHandlersEntry,
    AnimationGraphPoseGraphAssetDragHandlersView,
    AnimationGraphPoseGraphAddNodeInfo,
    AnimationGraphPoseGraphContext,
    AnimationGraphPoseView,
    AnimationGraphSnapshot,
    AnimationGraphStateMachineContext,
    AnimationGraphStateMachineView,
    AnimationGraphStateView,
    AnimationGraphTarget,
    AnimationGraphTransitionConditionView,
    AnimationGraphTransitionView,
    AnimationGraphVersion,
    AnimationGraphViewDump,
    ExecuteAnimationGraphCommandRequest,
    ReloadAnimationGraphOptions,
    SetAnimationGraphInspectorPropertyRequest,
} from './@types/public';
import type { IProperty } from '../scene/@types/public';
import { deserialize as deserializeAssetSource } from './asset-handler/utils';
import assetOperation from './manager/operation';
import assetQuery from './manager/query';
import {
    applyEncodedPropertyPatch,
    applyEncodedPropertyOperation,
    applyPropertyObjectOperation,
    applyPropertyObjectPatch,
    encodePropertyObject,
    encodeSerializedObject,
    getEncodedPropertyOperationCapabilities,
    queryPropertyObjectOperationCapabilities,
} from './serialized-data';
import { serialize as editorSerialize } from '../engine/editor-extends';

type AnimationGraphChangeListener = (event: AnimationGraphChangedEvent) => void;

interface SourceFingerprint {
    hash: string | null;
    mtimeMs: number | null;
    assetDbMtime: number | null;
}

interface AnimationGraphDocument {
    uuid: string;
    url: string;
    source: string;
    graph: any;
    documentId: string;
    revision: number;
    persistedRevision: number;
    dirty: boolean;
    externallyModified: boolean;
    fingerprint: SourceFingerprint;
    nodeIds: WeakMap<object, number>;
    nodesById: Map<number, object>;
    nextNodeId: number;
}

interface InspectorBinding {
    dump: IProperty;
    propertyCapabilities: Record<string, AnimationGraphInspectorPropertyCapabilities>;
    apply(path: string, patch: IProperty | unknown): Promise<void>;
    reset(path: string): Promise<void>;
    create(path: string): Promise<void>;
}

type InspectorOperation =
    | { type: 'set'; patch: IProperty | unknown }
    | { type: 'reset' }
    | { type: 'create' };

interface AdapterProperty {
    get(): unknown;
    set?(value: any): void;
    attrs?: Record<string, unknown>;
}

export class AnimationGraphEditError extends Error {
    constructor(
        public readonly code: import('./@types/public').AnimationGraphEditErrorCode,
        message: string,
        public readonly currentVersion?: AnimationGraphVersion,
    ) {
        super(message);
        this.name = 'AnimationGraphEditError';
    }
}

class AnimationGraphAssetService {
    private readonly _documents = new Map<string, AnimationGraphDocument>();
    private readonly _queues = new Map<string, Promise<void>>();
    private readonly _listeners = new Set<AnimationGraphChangeListener>();

    async query(uuidOrUrlOrPath: string): Promise<AnimationGraphSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const document = await this._getOrLoad(asset);
            await this._refreshExternalState(document);
            return this._snapshot(document);
        });
    }

    async queryInspector(
        uuidOrUrlOrPath: string,
        target: AnimationGraphTarget,
    ): Promise<AnimationGraphInspectorSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const document = await this._getOrLoad(asset);
            await this._refreshExternalState(document);
            return this._inspectorSnapshot(document, target);
        });
    }

    async queryPoseGraphAssetDragHandlers(): Promise<AnimationGraphPoseGraphAssetDragHandlersEntry[]> {
        const api = getNewGenAnim();
        const js = getCC().js;
        const result: AnimationGraphPoseGraphAssetDragHandlersEntry[] = [];
        for (const [ctor, info] of api.getPoseGraphAssetDragHandlersMap()) {
            result.push({
                assetType: js.getClassName(ctor) || ctor.name,
                handlers: Object.entries<{ displayName: string }>(info.handlers).map(([id, handler]) => ({
                    id,
                    displayName: handler.displayName,
                })),
            });
        }
        return result;
    }

    /**
     * Projects the engine's registered pose-node factories and drag handlers for the webview.
     *
     * ```mermaid
     * flowchart LR
     *     Registry[cc.js class registry] --> Factories[getCreatePoseGraphNodeEntries]
     *     Factories --> Menu[serialized add-node menu]
     *     Drag[pose-graph drag registry] --> Handlers[serialized handler map]
     * ```
     */
    private _queryPoseGraphEditingMetadata(
        document: AnimationGraphDocument,
        layerIndex: number,
    ): {
        addNodeInfos: AnimationGraphPoseGraphAddNodeInfo[];
        assetDragHandlersMap: Record<string, AnimationGraphPoseGraphAssetDragHandlersView>;
    } {
        const api = getNewGenAnim();
        const js = getCC().js;
        const poseNodeBase = js.getClassByName('cc.animation.PoseNode');
        const pureValueNodeBase = js.getClassByName('cc.animation.PureValueNode');
        const registered = (js._nameToClass ?? js._registeredClassNames) as Record<string, new (...args: any[]) => object> | undefined;
        const addNodeInfos: AnimationGraphPoseGraphAddNodeInfo[] = [];
        if (registered && poseNodeBase && pureValueNodeBase) {
            const constructors = new Set(Object.values(registered));
            for (const ctor of constructors) {
                if (ctor === poseNodeBase || ctor === pureValueNodeBase
                    || (!js.isChildClassOf(ctor, poseNodeBase) && !js.isChildClassOf(ctor, pureValueNodeBase))) {
                    continue;
                }
                const typeId = js.getClassName(ctor) || Object.keys(registered).find(name => registered[name] === ctor);
                if (!typeId) {
                    continue;
                }
                for (const entry of api.getCreatePoseGraphNodeEntries(ctor as any, {
                    animationGraph: document.graph,
                    layerIndex,
                })) {
                    const menu = [
                        entry.category,
                        `i18n:ENGINE.classes.${typeId}.displayName`,
                        entry.subMenu,
                    ].filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
                        .map(segment => segment.replace(/\/+$/, ''))
                        .join('/');
                    addNodeInfos.push({ typeId, args: entry.arg ?? null, menu });
                }
            }
        }

        const assetDragHandlersMap: Record<string, AnimationGraphPoseGraphAssetDragHandlersView> = {};
        for (const [ctor, info] of api.getPoseGraphAssetDragHandlersMap()) {
            const assetType = js.getClassName(ctor) || ctor.name;
            if (assetType) {
                assetDragHandlersMap[assetType] = {
                    handlers: Object.fromEntries(Object.entries(info.handlers as Record<string, { displayName: string }>).map(([id, handler]) => [id, {
                        displayName: handler.displayName,
                    }])),
                };
            }
        }
        return { addNodeInfos, assetDragHandlersMap };
    }

    async queryStateMachineComponentTypes(): Promise<string[]> {
        const js = getCC().js;
        const base = js.getClassByName('cc.animation.StateMachineComponent');
        if (!base) {
            throw new Error('State machine component base class can not be found: cc.animation.StateMachineComponent');
        }
        const result: string[] = [];
        // 当前引擎版本的 cc.js 直接暴露 js-typed 的 _nameToClass，_registeredClassNames 仅作兼容兜底。
        const registered = (js._nameToClass ?? js._registeredClassNames) as Record<string, new () => object> | undefined;
        if (!registered) {
            throw new Error('The engine js class registry is not available.');
        }
        for (const [name, ctor] of Object.entries(registered)) {
            if (ctor !== base && js.isChildClassOf(ctor, base)) {
                result.push(name);
            }
        }
        return result.sort();
    }

    async setInspectorProperty(
        uuidOrUrlOrPath: string,
        request: SetAnimationGraphInspectorPropertyRequest,
    ): Promise<AnimationGraphInspectorSnapshot> {
        return this._applyInspectorOperation(uuidOrUrlOrPath, request, {
            type: 'set',
            patch: request.patch,
        });
    }

    async resetInspectorProperty(
        uuidOrUrlOrPath: string,
        request: AnimationGraphInspectorPropertyOperationRequest,
    ): Promise<AnimationGraphInspectorSnapshot> {
        return this._applyInspectorOperation(uuidOrUrlOrPath, request, { type: 'reset' });
    }

    async createInspectorProperty(
        uuidOrUrlOrPath: string,
        request: AnimationGraphInspectorPropertyOperationRequest,
    ): Promise<AnimationGraphInspectorSnapshot> {
        return this._applyInspectorOperation(uuidOrUrlOrPath, request, { type: 'create' });
    }

    private async _applyInspectorOperation(
        uuidOrUrlOrPath: string,
        request: AnimationGraphInspectorPropertyOperationRequest,
        operation: InspectorOperation,
    ): Promise<AnimationGraphInspectorSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const document = await this._getOrLoad(asset);
            this._assertExpectedVersion(document, request.expected);
            await this._assertSourceUnchanged(document);
            const before = this._serialize(document.graph);
            const draft = this._cloneDocumentForMutation(document, before);
            const binding = this._resolveInspectorBinding(draft, request.target);
            try {
                switch (operation.type) {
                    case 'set':
                        await binding.apply(request.path, operation.patch);
                        break;
                    case 'reset':
                        await binding.reset(request.path);
                        break;
                    case 'create':
                        await binding.create(request.path);
                        break;
                }
            } catch (error) {
                if (error instanceof AnimationGraphEditError) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                const code = /readonly|hidden/i.test(message)
                    ? 'READONLY_PROPERTY'
                    : /does not support (reset|create)/i.test(message)
                        ? 'UNSUPPORTED_PROPERTY_OPERATION'
                        : 'INVALID_PROPERTY_PATCH';
                throw new AnimationGraphEditError(code, message, this._version(document));
            }
            if (this._serialize(draft.graph) === before) {
                return this._inspectorSnapshot(document, request.target);
            }
            this._commitMutation(document, draft);
            this._markChanged(document, 'inspector', request.sourceId, [request.path]);
            return this._inspectorSnapshot(document, request.target);
        });
    }

    async execute(
        uuidOrUrlOrPath: string,
        request: ExecuteAnimationGraphCommandRequest,
    ): Promise<AnimationGraphSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const document = await this._getOrLoad(asset);
            this._assertExpectedVersion(document, request.expected);
            await this._assertSourceUnchanged(document);
            const before = this._serialize(document.graph);
            const draft = this._cloneDocumentForMutation(document, before);
            try {
                await this._executeCommand(draft, request.command);
            } catch (error) {
                if (error instanceof AnimationGraphEditError) {
                    throw error;
                }
                throw new AnimationGraphEditError(
                    'INVALID_PROPERTY_PATCH',
                    error instanceof Error ? error.message : String(error),
                    this._version(document),
                );
            }
            if (this._serialize(draft.graph) === before) {
                return this._snapshot(document);
            }
            this._commitMutation(document, draft);
            this._markChanged(document, 'structure', request.sourceId, [this._commandPath(request.command)]);
            return this._snapshot(document);
        });
    }

    async save(
        uuidOrUrlOrPath: string,
        expected: AnimationGraphExpectedVersion,
        sourceId?: string,
    ): Promise<AnimationGraphSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const document = await this._getOrLoad(asset);
            this._assertExpectedVersion(document, expected);
            await this._assertSourceUnchanged(document);

            const serialized = this._serialize(document.graph);
            await assetOperation.saveAnimationGraphDocument(document.uuid, serialized);
            document.fingerprint = await this._readFingerprint(document.source, document.uuid);
            document.persistedRevision = document.revision;
            document.dirty = false;
            document.externallyModified = false;
            this._emitChanged(document, 'save', sourceId);
            return this._snapshot(document);
        });
    }

    async reload(
        uuidOrUrlOrPath: string,
        options: ReloadAnimationGraphOptions = {},
        sourceId?: string,
    ): Promise<AnimationGraphSnapshot> {
        const asset = this._queryAnimationGraphAsset(uuidOrUrlOrPath);
        return this._enqueue(asset.uuid, async () => {
            const current = this._documents.get(asset.uuid);
            if (current && options.expected) {
                this._assertExpectedVersion(current, options.expected);
            }
            if (current?.dirty && !options.discardDirty) {
                throw new AnimationGraphEditError(
                    'DIRTY_DOCUMENT',
                    `Animation Graph has unsaved changes: ${asset.uuid}`,
                    this._version(current),
                );
            }
            const document = await this._loadDocument(asset);
            this._documents.set(asset.uuid, document);
            this._emitChanged(document, 'reload', sourceId);
            return this._snapshot(document);
        });
    }

    onChanged(listener: AnimationGraphChangeListener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    async runExternalWrite<T>(uuidOrUrlOrPath: string, write: () => Promise<T>): Promise<T> {
        const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
        if (!asset || (asset.meta?.importer !== 'animation-graph' && (asset as any).type !== 'cc.AnimationGraph')) {
            return write();
        }
        return this.runExternalWrites([asset.uuid], write);
    }

    async runExternalWrites<T>(uuids: string[], write: () => Promise<T>): Promise<T> {
        const orderedUuids = Array.from(new Set(uuids)).sort((left, right) => left.localeCompare(right));
        const run = (index: number): Promise<T> => {
            if (index === orderedUuids.length) {
                return write();
            }
            const uuid = orderedUuids[index];
            return this._enqueue(uuid, async () => {
                this.assertExternalWriteAllowed(uuid);
                const result = await run(index + 1);
                const document = this._documents.get(uuid);
                if (document) {
                    await this._refreshExternalState(document);
                }
                return result;
            });
        };
        return run(0);
    }

    assertExternalWriteAllowed(uuidOrUrlOrPath: string): void {
        const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
        const uuid = asset?.uuid || uuidOrUrlOrPath;
        const document = this._documents.get(uuid);
        if (document?.dirty) {
            throw new AnimationGraphEditError(
                'DIRTY_DOCUMENT',
                `Animation Graph has unsaved changes and can not be overwritten through the generic asset API: ${uuid}`,
                this._version(document),
            );
        }
    }

    private async _getOrLoad(asset: IAsset): Promise<AnimationGraphDocument> {
        const existing = this._documents.get(asset.uuid);
        if (existing) {
            return existing;
        }
        const document = await this._loadDocument(asset);
        this._documents.set(asset.uuid, document);
        return document;
    }

    private async _loadDocument(asset: IAsset): Promise<AnimationGraphDocument> {
        const content = await readFile(asset.source, 'utf8');
        let serialized: unknown;
        try {
            serialized = JSON.parse(content);
        } catch (error) {
            throw new Error(`Invalid JSON in Animation Graph ${asset.uuid}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const graph = this._deserializeGraph(serialized, asset.uuid);
        return {
            uuid: asset.uuid,
            url: asset.url,
            source: asset.source,
            graph,
            documentId: randomUUID(),
            revision: 0,
            persistedRevision: 0,
            dirty: false,
            externallyModified: false,
            fingerprint: await this._readFingerprint(asset.source, asset.uuid, content),
            nodeIds: new WeakMap(),
            nodesById: new Map(),
            nextNodeId: 1,
        };
    }

    private _queryAnimationGraphAsset(uuidOrUrlOrPath: string): IAsset {
        const asset = assetQuery.queryAsset(uuidOrUrlOrPath);
        if (!asset) {
            throw new Error(`Animation Graph asset can not be found: ${uuidOrUrlOrPath}`);
        }
        const importer = asset.meta?.importer;
        const type = (asset as any).type;
        if (importer !== 'animation-graph' && type !== 'cc.AnimationGraph') {
            throw new Error(`Expected cc.AnimationGraph asset, got importer ${importer || 'unknown'} type ${type || 'unknown'}: ${uuidOrUrlOrPath}`);
        }
        if (!asset.source) {
            throw new Error(`Animation Graph asset has no source file: ${uuidOrUrlOrPath}`);
        }
        return asset;
    }

    private async _readFingerprint(source: string, uuid: string, knownContent?: string): Promise<SourceFingerprint> {
        let content = knownContent;
        let mtimeMs: number | null = null;
        try {
            if (content === undefined) {
                content = await readFile(source, 'utf8');
            }
            mtimeMs = (await stat(source)).mtimeMs;
        } catch {
            content = undefined;
        }
        return {
            hash: content === undefined ? null : createHash('sha256').update(content).digest('hex'),
            mtimeMs,
            assetDbMtime: assetQuery.queryAssetMtime(uuid),
        };
    }

    private async _refreshExternalState(document: AnimationGraphDocument): Promise<void> {
        const current = await this._readFingerprint(document.source, document.uuid);
        const externallyModified = !sameFingerprint(document.fingerprint, current);
        if (externallyModified && !document.externallyModified) {
            document.externallyModified = true;
            this._emitChanged(document, 'external');
        } else {
            document.externallyModified = externallyModified;
        }
    }

    private async _assertSourceUnchanged(document: AnimationGraphDocument): Promise<void> {
        await this._refreshExternalState(document);
        if (document.externallyModified) {
            throw new AnimationGraphEditError(
                'SOURCE_CHANGED',
                `Animation Graph source changed after it was loaded: ${document.uuid}`,
                this._version(document),
            );
        }
    }

    private _assertExpectedVersion(document: AnimationGraphDocument, expected: AnimationGraphExpectedVersion): void {
        if (expected.documentId !== document.documentId) {
            throw new AnimationGraphEditError(
                'DOCUMENT_RELOADED',
                `Animation Graph document was reloaded: ${document.uuid}`,
                this._version(document),
            );
        }
        if (expected.revision !== document.revision) {
            throw new AnimationGraphEditError(
                'VERSION_CONFLICT',
                `Animation Graph revision conflict: expected ${expected.revision}, current ${document.revision}`,
                this._version(document),
            );
        }
    }

    private _markChanged(
        document: AnimationGraphDocument,
        reason: 'inspector' | 'structure',
        sourceId?: string,
        changedPaths?: string[],
    ): void {
        document.revision += 1;
        document.dirty = true;
        this._emitChanged(document, reason, sourceId, changedPaths);
    }

    private _emitChanged(
        document: AnimationGraphDocument,
        reason: AnimationGraphChangedEvent['reason'],
        sourceId?: string,
        changedPaths?: string[],
    ): void {
        const event: AnimationGraphChangedEvent = {
            uuid: document.uuid,
            reason,
            version: this._version(document),
            sourceId,
            changedPaths,
        };
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('Animation Graph change listener failed.', error);
            }
        }
    }

    private _version(document: AnimationGraphDocument): AnimationGraphVersion {
        return {
            documentId: document.documentId,
            revision: document.revision,
            persistedRevision: document.persistedRevision,
            dirty: document.dirty,
            externallyModified: document.externallyModified,
        };
    }

    private _snapshot(document: AnimationGraphDocument): AnimationGraphSnapshot {
        return {
            uuid: document.uuid,
            url: document.url,
            ...this._version(document),
            graph: this._queryGraph(document),
        };
    }

    private _inspectorSnapshot(document: AnimationGraphDocument, target: AnimationGraphTarget): AnimationGraphInspectorSnapshot {
        const binding = this._resolveInspectorBinding(document, target);
        return {
            uuid: document.uuid,
            target: clonePlain(target),
            ...this._version(document),
            dump: binding.dump,
            propertyCapabilities: clonePlain(binding.propertyCapabilities),
        };
    }

    private _queryGraph(document: AnimationGraphDocument): AnimationGraphViewDump {
        const graph = document.graph;
        const api = getNewGenAnim();
        return {
            layers: Array.from(graph.layers as Iterable<any>).map((layer: any, index: number) => this._queryLayer(document, layer, index)),
            variables: Array.from(graph.variables as Iterable<[string, any]>).map(([name, variable]) => {
                const value = encodeSerializedObject(variable.value, api.getVariableValueAttributes(variable), variable, 'value');
                value.path = 'value';
                return {
                    name,
                    type: variable.type,
                    value,
                    resetMode: variable.type === api.VariableType.TRIGGER ? variable.resetMode : undefined,
                };
            }),
        };
    }

    private _queryLayer(document: AnimationGraphDocument, layer: any, index: number): AnimationGraphLayerView {
        const stateMachineContext: AnimationGraphStateMachineContext = {
            kind: 'layer-state-machine',
            layerIndex: index,
            stateMachinePath: [],
        };
        return {
            index,
            name: layer.name,
            weight: layer.weight,
            additive: !!layer.additive,
            maskUuid: getAssetUuid(layer.mask),
            stashes: Array.from(layer.stashes() as Iterable<[string, unknown]>).map(([name]) => name),
            stashPoseGraphs: Array.from(layer.stashes() as Iterable<[string, any]>).map(([name, stash]) => ({
                name,
                poseGraph: this._queryPoseGraph(document, stash.graph, {
                    kind: 'layer-stash',
                    layerIndex: index,
                    stashName: name,
                }),
                referenceCount: countStashReferences(layer, name),
            })),
            stateMachine: this._queryStateMachine(document, layer.stateMachine, stateMachineContext, []),
        };
    }

    private _queryStateMachine(
        document: AnimationGraphDocument,
        stateMachine: any,
        context: AnimationGraphStateMachineContext,
        path: number[],
    ): AnimationGraphStateMachineView {
        const states = Array.from(stateMachine.states() as Iterable<any>);
        const transitions = Array.from(stateMachine.transitions() as Iterable<any>);
        return {
            context: clonePlain(context),
            path: [...path],
            allowEmptyStates: !!stateMachine.allowEmptyStates,
            states: states.map((state, index) => this._queryState(document, stateMachine, states, transitions, state, index, context, path)),
            transitions: transitions.map((transition, index) => this._queryTransition(stateMachine, states, transition, index)),
            editorData: getEditorData(stateMachine),
        };
    }

    private _queryState(
        document: AnimationGraphDocument,
        stateMachine: any,
        states: any[],
        transitions: any[],
        state: any,
        index: number,
        context: AnimationGraphStateMachineContext,
        path: number[],
    ): AnimationGraphStateView {
        const api = getNewGenAnim();
        const type = getStateType(state, stateMachine, api);
        const view: AnimationGraphStateView = {
            index,
            type,
            name: state.name || '',
            incomingTransitionIndices: Array.from(stateMachine.getIncomings(state) as Iterable<any>).map((item) => transitions.indexOf(item)),
            outgoingTransitionIndices: Array.from(stateMachine.getOutgoings(state) as Iterable<any>).map((item) => transitions.indexOf(item)),
            components: getStateComponents(state).map((component, componentIndex) => ({
                index: componentIndex,
                type: getClassName(component),
            })),
            editorData: getEditorData(state),
        };
        if (state instanceof api.MotionState) {
            view.speed = state.speed;
            view.speedMultiplier = state.speedMultiplier;
            view.speedMultiplierEnabled = !!state.speedMultiplierEnabled;
            view.motion = state.motion ? this._queryMotion(state.motion, {
                kind: 'motion',
                stateMachine: clonePlain(context),
                stateIndex: index,
                level: [0],
            }) : null;
        } else if (state instanceof api.SubStateMachine) {
            const childContext: AnimationGraphStateMachineContext = context.kind === 'layer-state-machine'
                ? { ...context, stateMachinePath: [...context.stateMachinePath, index] }
                : { kind: 'sub-state-machine', stateMachine: clonePlain(context), stateIndex: index };
            view.stateMachine = this._queryStateMachine(document, state.stateMachine, childContext, [...path, index]);
        } else if (state instanceof api.ProceduralPoseState) {
            view.poseGraph = this._queryPoseGraph(document, state.graph, {
                kind: 'state-pose-graph',
                stateMachine: clonePlain(context),
                stateIndex: index,
            });
        }
        return view;
    }

    private _queryTransition(stateMachine: any, states: any[], transition: any, index: number): AnimationGraphTransitionView {
        const api = getNewGenAnim();
        const outgoings = Array.from(stateMachine.getOutgoings(transition.from) as Iterable<any>);
        const view: AnimationGraphTransitionView = {
            index,
            type: api.isAnimationTransition(transition)
                ? 'animation'
                : transition instanceof api.EmptyStateTransition
                    ? 'empty-state'
                    : transition instanceof api.ProceduralPoseTransition
                        ? 'procedural-pose'
                        : 'transition',
            fromStateIndex: states.indexOf(transition.from),
            toStateIndex: states.indexOf(transition.to),
            priority: outgoings.indexOf(transition),
            conditions: Array.isArray(transition.conditions)
                ? transition.conditions.map((condition: any, conditionIndex: number) => this._queryTransitionCondition(condition, conditionIndex))
                : [],
            editorData: getEditorData(transition),
        };
        if (
            api.isAnimationTransition(transition)
            || transition instanceof api.EmptyStateTransition
            || transition instanceof api.ProceduralPoseTransition
        ) {
            view.duration = transition.duration;
            view.destinationStart = transition.destinationStart;
            view.relativeDestinationStart = !!transition.relativeDestinationStart;
        }
        if (api.isAnimationTransition(transition)) {
            view.relativeDuration = !!transition.relativeDuration;
            view.exitConditionEnabled = !!transition.exitConditionEnabled;
            view.exitCondition = transition.exitCondition;
        }
        view.startEvent = transition.startEventBinding?.methodName ?? '';
        view.endEvent = transition.endEventBinding?.methodName ?? '';
        return view;
    }

    private _queryTransitionCondition(condition: any, index: number): AnimationGraphTransitionConditionView {
        const api = getNewGenAnim();
        if (condition instanceof api.BinaryCondition) {
            return {
                index,
                type: 'BinaryCondition',
                operator: condition.operator,
                lhs: condition.lhs,
                lhsBinding: dumpTransitionConditionBinding(condition.lhsBinding),
                bindingClass: getClassName(condition.lhsBinding),
                rhs: condition.rhs,
                isRhsInteger: condition.lhsBinding?.getValueType?.() === api.TCBindingValueType.INTEGER,
            };
        }
        if (condition instanceof api.UnaryCondition) {
            return {
                index,
                type: 'UnaryCondition',
                operator: condition.operator,
                operand: condition.operand?.variable || '',
            };
        }
        if (condition instanceof api.TriggerCondition) {
            return {
                index,
                type: 'TriggerCondition',
                trigger: condition.trigger || '',
            };
        }
        return {
            index,
            type: 'Unknown',
            className: getClassName(condition),
        };
    }

    private _queryMotion(
        motion: any,
        target: Extract<AnimationGraphTarget, { kind: 'motion' }>,
        threshold?: unknown,
        weight?: any,
    ): AnimationGraphMotionView {
        const api = getNewGenAnim();
        const type = getMotionType(motion, api);
        const view: AnimationGraphMotionView = {
            level: [...target.level],
            target: clonePlain(target),
            type,
            name: motion?.name || motion?.clip?.name || getClassName(motion),
            editorData: getEditorData(motion),
        };
        if (motion instanceof api.ClipMotion) {
            view.clipUuid = getAssetUuid(motion.clip);
        }
        if (motion instanceof api.AnimationBlend1D) {
            view.variable = motion.param.variable;
            view.value = motion.param.value;
        } else if (motion instanceof api.AnimationBlend2D) {
            view.variableX = motion.paramX.variable;
            view.valueX = motion.paramX.value;
            view.variableY = motion.paramY.variable;
            view.valueY = motion.paramY.value;
        }
        if (threshold !== undefined) {
            view.threshold = isVec2Like(threshold)
                ? { x: threshold.x, y: threshold.y }
                : threshold as number;
        }
        if (weight) {
            view.weight = {
                value: weight.value,
                variable: weight.variable,
            };
        }
        if (isBlendMotion(motion, api)) {
            view.children = Array.from(motion.items as Iterable<any>).map((item: any, index: number) => (
                this._queryMotion(
                    item.motion,
                    { ...target, level: [...target.level, index] },
                    item.threshold,
                    motion instanceof api.AnimationBlendDirect ? item.weight : undefined,
                )
            ));
        }
        return view;
    }

    private _queryPoseGraph(
        document: AnimationGraphDocument,
        poseGraph: any,
        context: AnimationGraphPoseGraphContext,
    ): AnimationGraphPoseView {
        const api = getNewGenAnim();
        const nodes = Array.from(poseGraph.nodes() as Iterable<any>);
        const rootOutputNodeId = this._nodeId(document, poseGraph.outputNode);
        const editingMetadata = this._queryPoseGraphEditingMetadata(document, getPoseGraphLayerIndex(context));
        return {
            context: clonePlain(context),
            rootOutputNodeId,
            ...editingMetadata,
            nodes: nodes.map((node) => {
                const id = this._nodeId(document, node);
                const view: import('./@types/public').AnimationGraphPoseNodeView = {
                    id,
                    type: getClassName(node),
                    title: getNodeTitle(node),
                    outputTypes: api.poseGraphOp.getOutputKeys(node).map((key: number) => api.poseGraphOp.getOutputType(node, key)),
                    inputs: api.poseGraphOp.getInputKeys(node).map((key: unknown) => {
                        const metadata = api.poseGraphOp.getInputMetadata(node, key) || {};
                        const binding = api.poseGraphOp.getInputBinding(poseGraph, node, key);
                        const input: import('./@types/public').AnimationGraphPoseInputView = {
                            id: JSON.stringify(key),
                            displayName: getPoseInputDisplayName(key, metadata),
                            type: metadata.type,
                            deletable: !!metadata.deletable,
                            insertPoint: !!metadata.insertPoint,
                            connected: !!binding,
                            producerNodeId: binding ? this._nodeId(document, binding.producer) : undefined,
                            producerOutputId: binding?.outputIndex,
                        };
                        if (!binding) {
                            input.value = this._encodePoseInputValue(node, key, metadata).dump;
                        }
                        return input;
                    }),
                    inputInsertInfos: clonePlain(api.poseGraphOp.getInputInsertInfos(node)),
                    editorData: getEditorData(node),
                };
                const enterInfo = getPoseNodeEnterInfo(node, api);
                if (enterInfo) {
                    view.enterInfo = {
                        type: enterInfo.type,
                        ...(enterInfo.type === 'stash' && typeof enterInfo.stashName === 'string'
                            ? { stashName: enterInfo.stashName }
                            : {}),
                    };
                }
                const nestedStateMachine = enterInfo?.type === 'state-machine'
                    ? enterInfo.target
                    : isStateMachineLike(node.stateMachine) ? node.stateMachine : undefined;
                if (nestedStateMachine) {
                    view.stateMachine = this._queryStateMachine(document, nestedStateMachine, {
                        kind: 'pose-node-state-machine',
                        poseGraph: clonePlain(context),
                        nodeId: id,
                    }, []);
                }
                const embeddedMotion = node.motion;
                if (embeddedMotion && getMotionType(embeddedMotion, api) !== 'unknown') {
                    view.motion = this._queryMotion(embeddedMotion, {
                        kind: 'motion',
                        poseGraph: clonePlain(context),
                        nodeId: id,
                        level: [0],
                    });
                } else if ('motion' in node) {
                    view.motion = null;
                }
                return view;
            }),
        };
    }

    private _resolveInspectorBinding(document: AnimationGraphDocument, target: AnimationGraphTarget): InspectorBinding {
        switch (target.kind) {
            case 'layer': {
                const layer = this._getLayer(document, target.layerIndex);
                return createAdapterBinding('Layer', {
                    name: directProperty(layer, 'name', { type: 'String', default: '' }),
                    weight: directProperty(layer, 'weight', { type: 'Number', default: 1, min: 0 }),
                    additive: directProperty(layer, 'additive', { type: 'Boolean', default: false }),
                    mask: directProperty(layer, 'mask', { type: 'Object', ctor: getNewGenAnim().AnimationMask, default: null }),
                });
            }
            case 'state': {
                const { state } = this._resolveState(document, target);
                return this._createStateBinding(state);
            }
            case 'transition': {
                const { transition } = this._resolveTransition(document, target);
                return this._createTransitionBinding(transition);
            }
            case 'motion': {
                const motion = this._resolveMotion(document, target);
                return this._createMotionBinding(motion);
            }
            case 'state-component': {
                const { state } = this._resolveState(document, target);
                const component = getStateComponents(state)[target.componentIndex];
                if (!component) {
                    throw this._targetNotFound(document, target);
                }
                return createDecoratedBinding(component, 'StateMachineComponent');
            }
            case 'pose-node': {
                const { poseGraph, node } = this._resolvePoseNode(document, target);
                if (!Array.from(poseGraph.nodes() as Iterable<any>).includes(node)) {
                    throw this._targetNotFound(document, target);
                }
                return createDecoratedBinding(node, 'PoseNode');
            }
            case 'pose-input':
                return this._createPoseInputBinding(document, target);
            default:
                throw new AnimationGraphEditError('UNSUPPORTED_TARGET', 'Unsupported Animation Graph target.', this._version(document));
        }
    }

    private _createStateBinding(state: any): InspectorBinding {
        const api = getNewGenAnim();
        const properties: Record<string, AdapterProperty> = {
            name: directProperty(state, 'name', { type: 'String', default: '' }),
        };
        if (state instanceof api.MotionState) {
            properties.speed = directProperty(state, 'speed', { type: 'Number', default: 1, min: 0 });
            properties.speedMultiplier = directProperty(state, 'speedMultiplier', { type: 'String', default: '' });
            properties.speedMultiplierEnabled = directProperty(state, 'speedMultiplierEnabled', { type: 'Boolean', default: false });
            properties.transitionInEvent = nestedProperty(state.transitionInEventBinding, 'methodName', { type: 'String', default: '' });
            properties.transitionOutEvent = nestedProperty(state.transitionOutEventBinding, 'methodName', { type: 'String', default: '' });
        } else if (state instanceof api.ProceduralPoseState) {
            properties.transitionInEvent = nestedProperty(state.transitionInEventBinding, 'methodName', { type: 'String', default: '' });
            properties.transitionOutEvent = nestedProperty(state.transitionOutEventBinding, 'methodName', { type: 'String', default: '' });
        }
        return createAdapterBinding(getClassName(state), properties);
    }

    private _createTransitionBinding(transition: any): InspectorBinding {
        const api = getNewGenAnim();
        const properties: Record<string, AdapterProperty> = {};
        if (
            api.isAnimationTransition(transition)
            || transition instanceof api.EmptyStateTransition
            || transition instanceof api.ProceduralPoseTransition
        ) {
            properties.duration = directProperty(transition, 'duration', { type: 'Number', default: 0.3, min: 0 });
            properties.destinationStart = directProperty(transition, 'destinationStart', { type: 'Number', default: 0, min: 0 });
            properties.relativeDestinationStart = directProperty(transition, 'relativeDestinationStart', { type: 'Boolean', default: false });
            properties.startEvent = nestedProperty(transition.startEventBinding, 'methodName', { type: 'String', default: '' });
            properties.endEvent = nestedProperty(transition.endEventBinding, 'methodName', { type: 'String', default: '' });
        }
        if (api.isAnimationTransition(transition)) {
            properties.relativeDuration = directProperty(transition, 'relativeDuration', { type: 'Boolean', default: false });
            properties.exitConditionEnabled = directProperty(transition, 'exitConditionEnabled', { type: 'Boolean', default: true });
            properties.exitCondition = directProperty(transition, 'exitCondition', { type: 'Number', default: 1, min: 0 });
        }
        return createAdapterBinding(getClassName(transition), properties);
    }

    private _createMotionBinding(motion: any): InspectorBinding {
        const api = getNewGenAnim();
        const properties: Record<string, AdapterProperty> = {};
        if (motion instanceof api.ClipMotion) {
            properties.clip = directProperty(motion, 'clip', { type: 'Object', ctor: getCC().AnimationClip, default: null });
        }
        if (motion instanceof api.AnimationBlend) {
            properties.name = directProperty(motion, 'name', { type: 'String', default: '' });
        }
        if (motion instanceof api.AnimationBlend1D) {
            properties.variable = nestedProperty(motion.param, 'variable', { type: 'String', default: '' });
            properties.value = nestedProperty(motion.param, 'value', { type: 'Number', default: 0 });
        } else if (motion instanceof api.AnimationBlend2D) {
            properties.algorithm = directProperty(motion, 'algorithm', {
                type: 'Enum',
                default: 0,
                enumList: enumList(api.AnimationBlend2D.Algorithm),
            });
            properties.variableX = nestedProperty(motion.paramX, 'variable', { type: 'String', default: '' });
            properties.valueX = nestedProperty(motion.paramX, 'value', { type: 'Number', default: 0 });
            properties.variableY = nestedProperty(motion.paramY, 'variable', { type: 'String', default: '' });
            properties.valueY = nestedProperty(motion.paramY, 'value', { type: 'Number', default: 0 });
        }
        return createAdapterBinding(getClassName(motion), properties);
    }

    private _createPoseInputBinding(document: AnimationGraphDocument, target: Extract<AnimationGraphTarget, { kind: 'pose-input' }>): InspectorBinding {
        const api = getNewGenAnim();
        const { poseGraph, node } = this._resolvePoseNode(document, target);
        const key = parsePoseInputId(api, target.inputId);
        if (!key || !api.poseGraphOp.isValidInputKey(node, key)) {
            throw this._targetNotFound(document, target);
        }
        const attrs = api.getPoseGraphNodeInputAttrs(node, key) || {};
        const metadata = api.poseGraphOp.getInputMetadata(node, key) || {};
        const { currentValue, propertyAttrs, dump } = this._encodePoseInputValue(node, key, metadata, attrs);
        const pseudo = { value: currentValue };
        if (api.poseGraphOp.getInputBinding(poseGraph, node, key)) {
            dump.visible = false;
        }
        const applyOperation = (operation: 'reset' | 'create'): void => {
            applyEncodedPropertyOperation(pseudo, 'value', dump, propertyAttrs, operation);
            setPoseInputValue(node, key, pseudo.value);
        };
        return {
            dump,
            propertyCapabilities: {
                value: getEncodedPropertyOperationCapabilities(dump, propertyAttrs),
            },
            apply: async (path, patch) => {
                if (path !== 'value') {
                    throw new Error(`Unknown property dump path: ${path}`);
                }
                await applyEncodedPropertyPatch(pseudo, 'value', dump, patch);
                setPoseInputValue(node, key, pseudo.value);
            },
            reset: async (path) => {
                assertInspectorBindingPath(path, 'value');
                applyOperation('reset');
            },
            create: async (path) => {
                assertInspectorBindingPath(path, 'value');
                applyOperation('create');
            },
        };
    }

    private _encodePoseInputValue(
        node: any,
        key: unknown,
        metadata: any,
        attrs = getNewGenAnim().getPoseGraphNodeInputAttrs(node, key) || {},
    ): { currentValue: unknown; propertyAttrs: Record<string, unknown>; dump: IProperty } {
        const currentValue = getNewGenAnim().poseGraphOp.getInputConstantValue(node, key);
        const propertyAttrs = { ...attrs, visible: isInputVisible(node, attrs) };
        const dump = encodeSerializedObject(currentValue, propertyAttrs, node, 'value');
        dump.path = 'value';
        dump.displayName ||= getPoseInputDisplayName(key, metadata);
        return { currentValue, propertyAttrs, dump };
    }

    private _getLayer(document: AnimationGraphDocument, layerIndex: number): any {
        const layer = document.graph.layers[layerIndex];
        if (!layer) {
            throw this._targetNotFound(document, { kind: 'layer', layerIndex });
        }
        return layer;
    }

    private _getLayerStateMachine(document: AnimationGraphDocument, layerIndex: number, path: number[]): any {
        const api = getNewGenAnim();
        let stateMachine = this._getLayer(document, layerIndex).stateMachine;
        for (const stateIndex of path) {
            const state = Array.from(stateMachine.states() as Iterable<any>)[stateIndex];
            if (!(state instanceof api.SubStateMachine)) {
                throw this._targetNotFound(document, { kind: 'state', layerIndex, stateMachinePath: path, stateIndex });
            }
            stateMachine = state.stateMachine;
        }
        return stateMachine;
    }

    private _getStateMachineByContext(document: AnimationGraphDocument, context: AnimationGraphStateMachineContext): any {
        switch (context.kind) {
            case 'layer-state-machine':
                return this._getLayerStateMachine(document, context.layerIndex, context.stateMachinePath);
            case 'pose-node-state-machine': {
                const { node } = this._resolvePoseNode(document, {
                    kind: 'pose-node',
                    poseGraph: context.poseGraph,
                    nodeId: context.nodeId,
                });
                const enterInfo = getPoseNodeEnterInfo(node, getNewGenAnim());
                const stateMachine = enterInfo?.type === 'state-machine'
                    ? enterInfo.target
                    : isStateMachineLike(node.stateMachine) ? node.stateMachine : undefined;
                if (!stateMachine) {
                    throw this._targetNotFound(document, context);
                }
                return stateMachine;
            }
            case 'sub-state-machine': {
                const parent = this._getStateMachineByContext(document, context.stateMachine);
                const state = Array.from(parent.states() as Iterable<any>)[context.stateIndex];
                if (!(state instanceof getNewGenAnim().SubStateMachine)) {
                    throw this._targetNotFound(document, context);
                }
                return state.stateMachine;
            }
        }
    }

    private _getStateMachineForAddress(document: AnimationGraphDocument, address: any): any {
        return address.stateMachine
            ? this._getStateMachineByContext(document, address.stateMachine)
            : this._getLayerStateMachine(document, address.layerIndex, address.stateMachinePath);
    }

    private _resolveState(
        document: AnimationGraphDocument,
        target: any,
    ): { stateMachine: any; state: any; states: any[] } {
        const stateMachine = this._getStateMachineForAddress(document, target);
        const states = Array.from(stateMachine.states() as Iterable<any>);
        const state = states[target.stateIndex];
        if (!state) {
            throw this._targetNotFound(document, target);
        }
        return { stateMachine, state, states };
    }

    private _resolveTransition(
        document: AnimationGraphDocument,
        target: any,
    ): { stateMachine: any; transition: any } {
        const stateMachine = this._getStateMachineForAddress(document, target);
        const transition = Array.from(stateMachine.transitions() as Iterable<any>)[target.transitionIndex];
        if (!transition) {
            throw this._targetNotFound(document, target);
        }
        return { stateMachine, transition };
    }

    private _resolveMotion(document: AnimationGraphDocument, target: Extract<AnimationGraphTarget, { kind: 'motion' }>): any {
        const api = getNewGenAnim();
        if (!target.level.length || target.level[0] !== 0) {
            throw this._targetNotFound(document, target);
        }
        let motion: any;
        if ('poseGraph' in target) {
            const { node } = this._resolvePoseNode(document, {
                kind: 'pose-node',
                poseGraph: target.poseGraph,
                nodeId: target.nodeId,
            });
            motion = node.motion;
        } else {
            const { state } = this._resolveState(document, target);
            if (!(state instanceof api.MotionState)) {
                throw this._targetNotFound(document, target);
            }
            motion = state.motion;
        }
        if (!motion) {
            throw this._targetNotFound(document, target);
        }
        for (const childIndex of target.level.slice(1)) {
            if (!isBlendMotion(motion, api)) {
                throw this._targetNotFound(document, target);
            }
            motion = Array.from(motion.items as Iterable<any>)[childIndex]?.motion;
            if (!motion) {
                throw this._targetNotFound(document, target);
            }
        }
        return motion;
    }

    private _resolvePoseGraph(
        document: AnimationGraphDocument,
        target: any,
    ): any {
        if ('poseGraph' in target) {
            return this._getPoseGraphByContext(document, target.poseGraph);
        }
        const { state } = this._resolveState(document, target);
        if (!(state instanceof getNewGenAnim().ProceduralPoseState)) {
            throw this._targetNotFound(document, target);
        }
        return state.graph;
    }

    private _getPoseGraphByContext(document: AnimationGraphDocument, context: AnimationGraphPoseGraphContext): any {
        switch (context.kind) {
            case 'state-pose-graph': {
                const stateMachine = this._getStateMachineByContext(document, context.stateMachine);
                const state = Array.from(stateMachine.states() as Iterable<any>)[context.stateIndex];
                if (!(state instanceof getNewGenAnim().ProceduralPoseState)) {
                    throw this._targetNotFound(document, context);
                }
                return state.graph;
            }
            case 'layer-stash': {
                const stash = this._getLayer(document, context.layerIndex).getStash(context.stashName);
                if (!stash) {
                    throw this._targetNotFound(document, context);
                }
                return stash.graph;
            }
        }
    }

    private _resolvePoseNode(
        document: AnimationGraphDocument,
        target: any,
    ): { poseGraph: any; node: any } {
        const poseGraph = this._resolvePoseGraph(document, target);
        const node = document.nodesById.get(target.nodeId);
        if (!node || !Array.from(poseGraph.nodes() as Iterable<any>).includes(node)) {
            throw this._targetNotFound(document, target);
        }
        return { poseGraph, node };
    }

    private _nodeId(document: AnimationGraphDocument, node: object): number {
        const existing = document.nodeIds.get(node);
        if (existing !== undefined) {
            return existing;
        }
        const id = document.nextNodeId++;
        document.nodeIds.set(node, id);
        document.nodesById.set(id, node);
        return id;
    }

    private async _executeCommand(document: AnimationGraphDocument, command: AnimationGraphCommand): Promise<void> {
        const api = getNewGenAnim();
        const graph = document.graph;
        switch (command.type) {
            case 'add-layer': {
                const layer = graph.addLayer();
                if (command.name !== undefined) {
                    layer.name = command.name;
                }
                return;
            }
            case 'remove-layer':
                this._getLayer(document, command.layerIndex);
                graph.removeLayer(command.layerIndex);
                return;
            case 'move-layer':
                this._getLayer(document, command.layerIndex);
                if (!graph.layers[command.newIndex]) {
                    throw this._targetNotFound(document, command);
                }
                graph.moveLayer(command.layerIndex, command.newIndex);
                return;
            case 'add-state': {
                const stateMachine = this._getStateMachineForAddress(document, command);
                const state = createState(stateMachine, command.stateType);
                state.name = command.name || uniqueStateName(stateMachine, defaultStateName(command.stateType));
                if (command.motionType !== undefined || command.clipUuid !== undefined) {
                    // motionType/clipUuid 仅对动画状态有效：创建后立即挂上 Motion（等价 add-state + set-motion 一次完成）。
                    const api = getNewGenAnim();
                    if (!(state instanceof api.MotionState)) {
                        throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'A motion can only be attached to a motion state.', this._version(document));
                    }
                    state.motion = this._createMotion(command.motionType || 'clip', command.clipUuid);
                }
                assignEditorData(state, command.editorData);
                return;
            }
            case 'remove-state': {
                const { stateMachine, state } = this._resolveState(document, command);
                if (state === stateMachine.entryState || state === stateMachine.exitState || state === stateMachine.anyState) {
                    throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Entry, Exit and Any states can not be removed.', this._version(document));
                }
                stateMachine.remove(state);
                return;
            }
            case 'duplicate-state': {
                const { stateMachine, state } = this._resolveState(document, command);
                if (state === stateMachine.entryState || state === stateMachine.exitState || state === stateMachine.anyState) {
                    throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Entry, Exit and Any states can not be duplicated.', this._version(document));
                }
                const clone = api.cloneState(stateMachine, state, !!command.includeTransitions);
                clone.name = uniqueStateName(stateMachine, state.name || defaultStateName(getStateType(state, stateMachine, api)));
                assignEditorData(clone, command.editorData);
                return;
            }
            case 'set-state-editor-data': {
                const { state } = this._resolveState(document, command);
                assignEditorData(state, command.editorData);
                return;
            }
            case 'add-transition': {
                const stateMachine = this._getStateMachineForAddress(document, command);
                const states = Array.from(stateMachine.states() as Iterable<any>);
                const from = states[command.fromStateIndex];
                const to = states[command.toStateIndex];
                if (!from || !to) {
                    throw this._targetNotFound(document, command);
                }
                stateMachine.connect(from, to);
                return;
            }
            case 'remove-transition': {
                const { stateMachine, transition } = this._resolveTransition(document, command);
                if (command.allBetween) {
                    stateMachine.disconnect(transition.from, transition.to);
                } else {
                    stateMachine.removeTransition(transition);
                }
                return;
            }
            case 'move-transition': {
                const { stateMachine, transition } = this._resolveTransition(document, command);
                stateMachine.adjustTransitionPriority(transition, command.offset);
                return;
            }
            case 'add-transition-condition': {
                const { transition } = this._resolveTransition(document, command.target);
                const condition = createTransitionCondition(api, command.conditionType);
                transition.conditions.push(condition);
                return;
            }
            case 'remove-transition-condition': {
                const { transition } = this._resolveTransition(document, command.target);
                if (!transition.conditions[command.conditionIndex]) {
                    throw this._targetNotFound(document, command);
                }
                transition.conditions.splice(command.conditionIndex, 1);
                return;
            }
            case 'set-transition-condition-property': {
                const { transition } = this._resolveTransition(document, command.target);
                const condition = transition.conditions[command.conditionIndex];
                if (!condition) {
                    throw this._targetNotFound(document, command);
                }
                setTransitionConditionProperty(condition, command.path, command.value, api);
                return;
            }
            case 'set-transition-condition-binding-class': {
                const { transition } = this._resolveTransition(document, command.target);
                const condition = transition.conditions[command.conditionIndex];
                if (!(condition instanceof api.BinaryCondition)) {
                    throw this._targetNotFound(document, command);
                }
                const bindingClass = requireTransitionConditionBindingClass('bindingClass', command.bindingClass);
                const ctor = getCC().js.getClassByName(bindingClass);
                if (!ctor) {
                    throw new AnimationGraphEditError('TARGET_NOT_FOUND', `Transition condition binding class can not be found: ${bindingClass}`, this._version(document));
                }
                condition.lhsBinding = new ctor();
                return;
            }
            case 'set-transition-event-binding': {
                const { transition } = this._resolveTransition(document, command);
                const binding = command.which === 'start' ? transition.startEventBinding : transition.endEventBinding;
                if (!binding) {
                    throw this._targetNotFound(document, command);
                }
                binding.methodName = requireString('methodName', command.methodName);
                return;
            }
            case 'set-motion': {
                const motion = command.motionType === 'none'
                    ? null
                    : this._createMotion(command.motionType, command.clipUuid);
                if ('poseGraph' in command) {
                    const { node } = this._resolvePoseNode(document, {
                        kind: 'pose-node',
                        poseGraph: command.poseGraph,
                        nodeId: command.nodeId,
                    });
                    if (!('motion' in node)) {
                        throw this._targetNotFound(document, command);
                    }
                    node.motion = motion;
                } else {
                    const { state } = this._resolveState(document, command);
                    if (!(state instanceof api.MotionState)) {
                        throw this._targetNotFound(document, command);
                    }
                    state.motion = motion;
                }
                return;
            }
            case 'add-motion-child': {
                const motion = this._resolveMotion(document, command.target);
                if (!isBlendMotion(motion, api)) {
                    throw this._targetNotFound(document, command.target);
                }
                const child = this._createMotion(command.motionType, command.clipUuid);
                const item = createBlendItem(motion, api, child);
                const items = Array.from(motion.items as Iterable<any>);
                items.push(item);
                motion.items = items;
                return;
            }
            case 'remove-motion':
                this._removeMotion(document, command.target);
                return;
            case 'set-motion-editor-data': {
                const motion = this._resolveMotion(document, command.target);
                assignEditorData(motion, command.editorData);
                return;
            }
            case 'set-motion-threshold': {
                const motion = this._resolveMotion(document, command.target);
                const items = isBlendMotion(motion, api) ? Array.from(motion.items as Iterable<any>) : [];
                const item = items[command.childIndex];
                if (!item) {
                    throw this._targetNotFound(document, command.target);
                }
                if (motion instanceof api.AnimationBlend1D && typeof command.threshold === 'number') {
                    item.threshold = command.threshold;
                    motion.items = items;
                    return;
                }
                if (motion instanceof api.AnimationBlend2D && isVec2Like(command.threshold)) {
                    item.threshold = new (getCC().Vec2)(command.threshold.x, command.threshold.y);
                    motion.items = items;
                    return;
                }
                throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Motion threshold type does not match the blend type.', this._version(document));
            }
            case 'set-direct-blend-weight': {
                const motion = this._resolveMotion(document, command.target);
                if (!(motion instanceof api.AnimationBlendDirect)) {
                    throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Motion is not a direct blend.', this._version(document));
                }
                const items = Array.from(motion.items as Iterable<any>);
                const item = items[command.childIndex];
                if (!item) {
                    throw this._targetNotFound(document, command.target);
                }
                if (command.value === undefined && command.variable === undefined) {
                    throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Direct blend weight patch is empty.', this._version(document));
                }
                if (command.value !== undefined) {
                    if (typeof command.value !== 'number' || !Number.isFinite(command.value)) {
                        throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Direct blend weight expects a finite number.', this._version(document));
                    }
                    item.weight.value = command.value;
                }
                if (command.variable !== undefined) {
                    if (typeof command.variable !== 'string') {
                        throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'Direct blend weight variable expects a string.', this._version(document));
                    }
                    item.weight.variable = command.variable;
                }
                motion.items = items;
                return;
            }
            case 'add-state-component': {
                const { state } = this._resolveState(document, command);
                if (!(state instanceof api.MotionState || state instanceof api.SubStateMachine)) {
                    throw this._targetNotFound(document, command);
                }
                const ctor = getCC().js.getClassByName(command.componentType);
                if (!ctor) {
                    throw new AnimationGraphEditError('TARGET_NOT_FOUND', `State machine component type can not be found: ${command.componentType}`, this._version(document));
                }
                state.addComponent(ctor);
                return;
            }
            case 'remove-state-component': {
                const { state } = this._resolveState(document, command);
                const component = getStateComponents(state)[command.componentIndex];
                if (!component || typeof state.removeComponent !== 'function') {
                    throw this._targetNotFound(document, command);
                }
                state.removeComponent(component);
                return;
            }
            case 'add-pose-node': {
                const poseGraph = this._resolvePoseGraph(document, command);
                const ctor = getCC().js.getClassByName(command.nodeType);
                if (!ctor) {
                    throw new AnimationGraphEditError('TARGET_NOT_FOUND', `Pose node type can not be found: ${command.nodeType}`, this._version(document));
                }
                const node = api.createPoseGraphNode(ctor, command.createArg);
                poseGraph.addNode(node);
                assignEditorData(node, command.editorData);
                this._nodeId(document, node);
                return;
            }
            case 'create-pose-node-on-asset-drag': {
                const poseGraph = this._resolvePoseGraph(document, command);
                const js = getCC().js;
                const asset = assetQuery.queryAsset(command.assetUuid);
                if (!asset) {
                    throw new AnimationGraphEditError('TARGET_NOT_FOUND', `Asset can not be found: ${command.assetUuid}`, this._version(document));
                }
                const assetType = assetQuery.queryAssetProperty(asset, 'type') as string;
                const assetCtor = typeof assetType === 'string' ? js.getClassByName(assetType) : undefined;
                if (!assetCtor || !js.isChildClassOf(assetCtor, getCC().Asset)) {
                    throw new AnimationGraphEditError('TARGET_NOT_FOUND', `Asset type can not be found: ${assetType}`, this._version(document));
                }
                // 引擎按资产构造器精确匹配注册表（registry.get(asset.constructor)），
                // 这里先自行校验，把引擎的 console.warn + undefined 转换为明确的错误。
                let registered: { handlers: Record<string, { displayName: string }> } | undefined;
                for (const [ctor, info] of api.getPoseGraphAssetDragHandlersMap()) {
                    if (ctor === assetCtor) {
                        registered = info;
                        break;
                    }
                }
                if (!registered) {
                    throw new AnimationGraphEditError(
                        'TARGET_NOT_FOUND',
                        `No pose graph asset drag handlers for asset type: ${assetType}`,
                        this._version(document),
                    );
                }
                if (!(command.handlerId in registered.handlers)) {
                    throw new AnimationGraphEditError(
                        'TARGET_NOT_FOUND',
                        `Pose graph asset drag handler can not be found: ${command.handlerId}, existing handlers are ${Object.keys(registered.handlers).join(',')}`,
                        this._version(document),
                    );
                }
                // serialize.asAsset 生成的 stub 是资产构造器的真实实例（仅设置 _uuid），
                // 内置 handler 只是把它赋给 motion.clip 字段，因此 stub 即可满足。
                const reference = this._createAssetReference(command.assetUuid, assetCtor);
                const node = api.createPoseNodeOnAssetDrag(reference, command.handlerId);
                if (!node) {
                    throw new AnimationGraphEditError(
                        'INVALID_PROPERTY_PATCH',
                        `Pose graph asset drag handler ${command.handlerId} did not create a pose node for asset: ${command.assetUuid}`,
                        this._version(document),
                    );
                }
                poseGraph.addNode(node);
                assignEditorData(node, command.editorData);
                this._nodeId(document, node);
                return;
            }
            case 'remove-pose-node': {
                const { poseGraph, node } = this._resolvePoseNode(document, command.target);
                if (node === poseGraph.outputNode) {
                    throw new AnimationGraphEditError('INVALID_PROPERTY_PATCH', 'The Pose Graph output node can not be removed.', this._version(document));
                }
                poseGraph.removeNode(node);
                document.nodesById.delete(command.target.nodeId);
                return;
            }
            case 'duplicate-pose-nodes': {
                const poseGraph = this._resolvePoseGraph(document, command);
                const nodes = command.nodeIds.map((id) => document.nodesById.get(id));
                const poseGraphNodes = new Set(Array.from(poseGraph.nodes() as Iterable<any>));
                if (nodes.some((node) => !node || node === poseGraph.outputNode || !poseGraphNodes.has(node))) {
                    throw this._targetNotFound(document, command);
                }
                const copyInfo = api.copyPoseGraphNodes(poseGraph, nodes);
                const result = api.pastePoseGraphNodes(poseGraph, copyInfo);
                for (const node of result.addedNodes) {
                    this._nodeId(document, node);
                }
                return;
            }
            case 'set-pose-node-editor-data': {
                const { node } = this._resolvePoseNode(document, command.target);
                assignEditorData(node, command.editorData);
                return;
            }
            case 'connect-pose-nodes': {
                const poseGraph = this._resolvePoseGraph(document, command);
                const producer = document.nodesById.get(command.producerNodeId);
                const consumer = document.nodesById.get(command.consumerNodeId);
                const input = consumer && parsePoseInputId(api, command.consumerInputId);
                const poseGraphNodes = new Set(Array.from(poseGraph.nodes() as Iterable<any>));
                if (
                    !producer
                    || !consumer
                    || !poseGraphNodes.has(producer)
                    || !poseGraphNodes.has(consumer)
                    || !input
                    || !api.poseGraphOp.isValidInputKey(consumer, input)
                ) {
                    throw this._targetNotFound(document, command);
                }
                const outputs = api.poseGraphOp.getOutputKeys(producer);
                if (!outputs.includes(command.producerOutputId)) {
                    throw this._targetNotFound(document, command);
                }
                api.poseGraphOp.connectNode(poseGraph, consumer, input, producer, command.producerOutputId);
                return;
            }
            case 'disconnect-pose-input': {
                const { poseGraph, node } = this._resolvePoseNode(document, command.target);
                const input = parsePoseInputId(api, command.target.inputId);
                if (!input || !api.poseGraphOp.isValidInputKey(node, input)) {
                    throw this._targetNotFound(document, command.target);
                }
                api.poseGraphOp.disconnectNode(poseGraph, node, input);
                return;
            }
            case 'insert-pose-input': {
                const { poseGraph, node } = this._resolvePoseNode(document, command.target);
                if (!(command.insertId in api.poseGraphOp.getInputInsertInfos(node))) {
                    throw this._targetNotFound(document, command.target);
                }
                api.poseGraphOp.insertInput(poseGraph, node, command.insertId);
                return;
            }
            case 'delete-pose-input': {
                const { poseGraph, node } = this._resolvePoseNode(document, command.target);
                const input = parsePoseInputId(api, command.target.inputId);
                if (!input || !api.poseGraphOp.isValidInputKey(node, input) || !api.poseGraphOp.getInputMetadata(node, input)?.deletable) {
                    throw this._targetNotFound(document, command.target);
                }
                api.poseGraphOp.deleteInput(poseGraph, node, input);
                return;
            }
            case 'add-variable':
                if (graph.getVariable(command.name)) {
                    throw this._nameConflict(document, 'variable', command.name);
                }
                graph.addVariable(command.name, command.variableType, command.initialValue);
                return;
            case 'set-variable-value': {
                const variable = graph.getVariable(command.name);
                if (!variable) {
                    throw this._targetNotFound(document, command);
                }
                const dump = encodeSerializedObject(variable.value, api.getVariableValueAttributes(variable), variable, 'value');
                dump.path = 'value';
                await applyEncodedPropertyPatch(variable, 'value', dump, command.patch);
                return;
            }
            case 'set-trigger-reset-mode': {
                const variable = graph.getVariable(command.name);
                if (!variable || variable.type !== api.VariableType.TRIGGER) {
                    throw this._targetNotFound(document, command);
                }
                const resetModes = Object.values(api.TriggerResetMode).filter((value): value is number => typeof value === 'number');
                if (!resetModes.includes(command.resetMode)) {
                    throw new AnimationGraphEditError(
                        'INVALID_PROPERTY_PATCH',
                        `Invalid trigger reset mode: ${command.resetMode}`,
                        this._version(document),
                    );
                }
                variable.resetMode = command.resetMode;
                return;
            }
            case 'remove-variable':
                if (!graph.getVariable(command.name)) {
                    throw this._targetNotFound(document, command);
                }
                graph.removeVariable(command.name);
                return;
            case 'rename-variable':
                if (!graph.getVariable(command.name)) {
                    throw this._targetNotFound(document, command);
                }
                if (command.newName !== command.name && graph.getVariable(command.newName)) {
                    throw this._nameConflict(document, 'variable', command.newName);
                }
                graph.renameVariable(command.name, command.newName);
                for (const variableBinding of api.viewVariableBindings(graph)) {
                    if (variableBinding.name === command.name) {
                        variableBinding.rebind(command.newName);
                    }
                }
                return;
            case 'add-stash': {
                const layer = this._getLayer(document, command.layerIndex);
                if (layer.getStash(command.name)) {
                    throw this._nameConflict(document, 'stash', command.name);
                }
                layer.addStash(command.name);
                return;
            }
            case 'remove-stash': {
                const layer = this._getLayer(document, command.layerIndex);
                if (!layer.getStash(command.name)) {
                    throw this._targetNotFound(document, command);
                }
                layer.removeStash(command.name);
                return;
            }
            case 'rename-stash': {
                const layer = this._getLayer(document, command.layerIndex);
                if (!layer.getStash(command.name)) {
                    throw this._targetNotFound(document, command);
                }
                if (command.newName !== command.name && layer.getStash(command.newName)) {
                    throw this._nameConflict(document, 'stash', command.newName);
                }
                layer.renameStash(command.name, command.newName);
                for (const reference of api.visitStashReferences(layer, command.name)) {
                    reference.alterReference(command.newName);
                }
                return;
            }
            case 'stash-pose-graph': {
                const layer = this._getLayer(document, command.layerIndex);
                if (getPoseGraphContextLayerIndex(command.poseGraph) !== command.layerIndex) {
                    throw this._targetNotFound(document, command.poseGraph);
                }
                const poseGraph = this._getPoseGraphByContext(document, command.poseGraph);
                const originalNodes = Array.from(poseGraph.nodes() as Iterable<any>);
                const stashName = command.stashName ?? uniqueStashName(layer);
                if (layer.getStash(stashName)) {
                    throw this._nameConflict(document, 'stash', stashName);
                }
                for (const node of originalNodes) {
                    assignEditorData(node, {});
                }
                const result = withSerializableEditorExtras(collectEditorExtrasConstructors(poseGraph), () => (
                    api.stashPoseGraph(layer, poseGraph, stashName)
                ));
                if (!result) {
                    throw new AnimationGraphEditError(
                        'INVALID_PROPERTY_PATCH',
                        `Animation Graph Pose Graph can not be stashed as: ${stashName}`,
                        this._version(document),
                    );
                }
                const remainingNodes = new Set(poseGraph.nodes() as Iterable<any>);
                for (const node of originalNodes) {
                    if (remainingNodes.has(node)) {
                        continue;
                    }
                    const nodeId = document.nodeIds.get(node);
                    if (nodeId !== undefined) {
                        document.nodesById.delete(nodeId);
                    }
                    document.nodeIds.delete(node);
                }
                assignEditorData(result.useStashNode, command.editorData);
                this._nodeId(document, result.useStashNode);
                return;
            }
            default:
                throw new AnimationGraphEditError('UNSUPPORTED_TARGET', 'Unsupported Animation Graph command.', this._version(document));
        }
    }

    private _createMotion(type: AnimationGraphMotionType, clipUuid?: string): any {
        const api = getNewGenAnim();
        let motion: any;
        switch (type) {
            case 'clip':
                motion = new api.ClipMotion();
                motion.clip = clipUuid ? this._createAssetReference(clipUuid, getCC().AnimationClip) : null;
                break;
            case 'blend-1d':
                motion = new api.AnimationBlend1D();
                break;
            case 'blend-2d':
                motion = new api.AnimationBlend2D();
                break;
            case 'blend-direct':
                motion = new api.AnimationBlendDirect();
                break;
        }
        return motion;
    }

    private _removeMotion(document: AnimationGraphDocument, target: Extract<AnimationGraphTarget, { kind: 'motion' }>): void {
        const api = getNewGenAnim();
        if (!target.level.length || target.level[0] !== 0) {
            throw this._targetNotFound(document, target);
        }
        if (target.level.length === 1) {
            if ('poseGraph' in target) {
                const { node } = this._resolvePoseNode(document, {
                    kind: 'pose-node',
                    poseGraph: target.poseGraph,
                    nodeId: target.nodeId,
                });
                if (!('motion' in node)) {
                    throw this._targetNotFound(document, target);
                }
                node.motion = null;
            } else {
                const { state } = this._resolveState(document, target);
                if (!(state instanceof api.MotionState)) {
                    throw this._targetNotFound(document, target);
                }
                state.motion = null;
            }
            return;
        }
        const parentTarget = { ...target, level: target.level.slice(0, -1) };
        const parent = this._resolveMotion(document, parentTarget);
        if (!isBlendMotion(parent, api)) {
            throw this._targetNotFound(document, target);
        }
        const childIndex = target.level[target.level.length - 1];
        const items = Array.from(parent.items as Iterable<any>);
        if (!items[childIndex]) {
            throw this._targetNotFound(document, target);
        }
        items.splice(childIndex, 1);
        parent.items = items;
    }

    private _createAssetReference(uuid: string, ctor: new () => any): any {
        const asset = assetQuery.queryAsset(uuid);
        if (!asset) {
            throw new Error(`Asset can not be found: ${uuid}`);
        }
        const serialize = getEditorSerialize();
        const reference = serialize.asAsset(uuid, ctor);
        if (!reference) {
            throw new Error(`Can not create asset reference: ${uuid}`);
        }
        return reference;
    }

    private _serialize(graph: any): string {
        return withSerializableEditorExtras(collectEditorExtrasConstructors(graph), () => {
            const serialized = getEditorSerialize()(graph);
            return typeof serialized === 'string' ? serialized : JSON.stringify(serialized, null, 2);
        });
    }

    private _deserializeGraph(serialized: unknown, uuid: string): any {
        const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
        const graph = withSerializableEditorExtras(collectSerializedEditorExtrasConstructors(data), () => (
            deserializeAssetSource(data as object)
        ));
        const { AnimationGraph } = getNewGenAnim();
        if (!(graph instanceof AnimationGraph)) {
            throw new Error(`Asset is not an AnimationGraph: ${uuid}`);
        }
        graph.onLoaded?.();
        if ('_uuid' in graph) {
            graph._uuid = uuid;
        }
        return graph;
    }

    private _cloneDocumentForMutation(document: AnimationGraphDocument, serialized: string): AnimationGraphDocument {
        const graph = this._deserializeGraph(serialized, document.uuid);
        const draft: AnimationGraphDocument = {
            ...document,
            graph,
            nodeIds: new WeakMap(),
            nodesById: new Map(),
            nextNodeId: document.nextNodeId,
        };
        const currentNodes = this._collectPoseNodes(document.graph);
        const draftNodes = this._collectPoseNodes(graph);
        if (currentNodes.length !== draftNodes.length) {
            throw new Error(`Animation Graph clone changed Pose Node count: ${document.uuid}`);
        }
        for (let index = 0; index < currentNodes.length; ++index) {
            const id = document.nodeIds.get(currentNodes[index]);
            if (id !== undefined) {
                draft.nodeIds.set(draftNodes[index], id);
                draft.nodesById.set(id, draftNodes[index]);
            }
        }
        return draft;
    }

    private _commitMutation(document: AnimationGraphDocument, draft: AnimationGraphDocument): void {
        document.graph = draft.graph;
        document.nodeIds = draft.nodeIds;
        document.nodesById = draft.nodesById;
        document.nextNodeId = draft.nextNodeId;
    }

    private _collectPoseNodes(graph: any): object[] {
        const api = getNewGenAnim();
        const nodes: object[] = [];
        const visitedStateMachines = new Set<object>();
        const visitedPoseGraphs = new Set<object>();
        const visitStateMachine = (stateMachine: any): void => {
            if (!stateMachine || visitedStateMachines.has(stateMachine)) {
                return;
            }
            visitedStateMachines.add(stateMachine);
            for (const state of stateMachine.states() as Iterable<any>) {
                if (state instanceof api.SubStateMachine) {
                    visitStateMachine(state.stateMachine);
                } else if (state instanceof api.ProceduralPoseState) {
                    visitPoseGraph(state.graph);
                }
            }
        };
        const visitPoseGraph = (poseGraph: any): void => {
            if (!poseGraph || visitedPoseGraphs.has(poseGraph)) {
                return;
            }
            visitedPoseGraphs.add(poseGraph);
            for (const node of poseGraph.nodes() as Iterable<any>) {
                nodes.push(node);
                const enterInfo = getPoseNodeEnterInfo(node, getNewGenAnim());
                const stateMachine = enterInfo?.type === 'state-machine'
                    ? enterInfo.target
                    : isStateMachineLike(node.stateMachine) ? node.stateMachine : undefined;
                if (stateMachine) {
                    visitStateMachine(stateMachine);
                }
            }
        };
        for (const layer of graph.layers as Iterable<any>) {
            visitStateMachine(layer.stateMachine);
            for (const [, stash] of layer.stashes() as Iterable<[string, any]>) {
                visitPoseGraph(stash.graph);
            }
        }
        return nodes;
    }

    private _commandPath(command: AnimationGraphCommand): string {
        return `graph.${command.type}`;
    }

    private _targetNotFound(document: AnimationGraphDocument, target: unknown): AnimationGraphEditError {
        return new AnimationGraphEditError(
            'TARGET_NOT_FOUND',
            `Animation Graph target can not be found: ${JSON.stringify(target)}`,
            this._version(document),
        );
    }

    private _nameConflict(document: AnimationGraphDocument, kind: string, name: string): AnimationGraphEditError {
        return new AnimationGraphEditError(
            'NAME_CONFLICT',
            `Animation Graph ${kind} already exists: ${name}`,
            this._version(document),
        );
    }

    private _enqueue<T>(uuid: string, task: () => Promise<T>): Promise<T> {
        const previous = this._queues.get(uuid) || Promise.resolve();
        const result = previous.then(task, task);
        const settled = result.then(() => undefined, () => undefined);
        this._queues.set(uuid, settled);
        void settled.then(() => {
            if (this._queues.get(uuid) === settled) {
                this._queues.delete(uuid);
            }
        });
        return result;
    }
}

function getCC(): any {
    return require('cc');
}

function getNewGenAnim(): any {
    return require('cc/editor/new-gen-anim');
}

function getEditorSerialize(): any {
    const serialize = (globalThis as any).EditorExtends?.serialize || editorSerialize;
    if (!serialize) {
        throw new Error('EditorExtends.serialize is not initialized.');
    }
    return serialize;
}

function sameFingerprint(left: SourceFingerprint, right: SourceFingerprint): boolean {
    return left.hash === right.hash
        && left.mtimeMs === right.mtimeMs
        && left.assetDbMtime === right.assetDbMtime;
}

function clonePlain<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

function getClassName(value: any): string {
    if (!value) {
        return '';
    }
    return getCC().js.getClassName(value) || value.constructor?.name || 'Unknown';
}

/** Counts the pose nodes that reference a Layer Stash; failures degrade to 0 with a warning. */
function countStashReferences(layer: any, stashName: string): number {
    try {
        return Array.from(getNewGenAnim().visitStashReferences(layer, stashName)).length;
    } catch (error) {
        console.warn(`[animation-graph] failed to count references of stash "${stashName}".`, error);
        return 0;
    }
}

function getPoseGraphLayerIndex(context: AnimationGraphPoseGraphContext): number {
    if (context.kind === 'layer-stash') {
        return context.layerIndex;
    }
    return getStateMachineLayerIndex(context.stateMachine);
}

function getStateMachineLayerIndex(context: AnimationGraphStateMachineContext): number {
    switch (context.kind) {
        case 'layer-state-machine':
            return context.layerIndex;
        case 'pose-node-state-machine':
            return getPoseGraphLayerIndex(context.poseGraph);
        case 'sub-state-machine':
            return getStateMachineLayerIndex(context.stateMachine);
    }
}

function getAssetUuid(value: any): string | null {
    const uuid = value?._uuid || value?.uuid;
    return typeof uuid === 'string' && uuid ? uuid : null;
}

function getEditorData(value: any): Record<string, unknown> | undefined {
    const data = value?.[getCC().editorExtrasTag];
    if (!data || typeof data !== 'object') {
        return undefined;
    }
    return clonePlain(data);
}

function assignEditorData(value: any, data?: Record<string, unknown>): void {
    if (!data) {
        return;
    }
    const tag = getCC().editorExtrasTag;
    Object.assign(value[tag] ||= {}, clonePlain(data));
}

interface ClassSerializationState {
    constructor: any;
    props?: PropertyDescriptor;
    values?: PropertyDescriptor;
    deserialize?: PropertyDescriptor;
}

function withSerializableEditorExtras<T>(constructors: Iterable<any>, action: () => T): T {
    const tag = getCC().editorExtrasTag || '__editorExtras__';
    const states: ClassSerializationState[] = [];
    let operationFailed = false;
    try {
        for (const constructor of new Set(constructors)) {
            if (typeof constructor !== 'function' || !Array.isArray(constructor.__values__) || constructor.__values__.includes(tag)) {
                continue;
            }
            const state: ClassSerializationState = {
                constructor,
                props: Object.getOwnPropertyDescriptor(constructor, '__props__'),
                values: Object.getOwnPropertyDescriptor(constructor, '__values__'),
                deserialize: Object.getOwnPropertyDescriptor(constructor, '__deserialize__'),
            };
            states.push(state);
            if (Array.isArray(constructor.__props__) && !constructor.__props__.includes(tag)) {
                constructor.__props__ = [...constructor.__props__, tag];
            }
            constructor.__values__ = [...constructor.__values__, tag];
            if (!state.deserialize || state.deserialize.configurable !== false) {
                delete constructor.__deserialize__;
            }
        }
        return action();
    } catch (error) {
        operationFailed = true;
        throw error;
    } finally {
        let restorationFailed = false;
        let restorationError: unknown;
        for (const state of states.reverse()) {
            for (const [key, descriptor] of [
                ['__deserialize__', state.deserialize],
                ['__values__', state.values],
                ['__props__', state.props],
            ] as const) {
                try {
                    restoreOwnProperty(state.constructor, key, descriptor);
                } catch (error) {
                    if (!restorationFailed) {
                        restorationFailed = true;
                        restorationError = error;
                    }
                }
            }
        }
        if (restorationFailed && !operationFailed) {
            throw restorationError;
        }
    }
}

function restoreOwnProperty(owner: object, key: string, descriptor?: PropertyDescriptor): void {
    if (descriptor) {
        Object.defineProperty(owner, key, descriptor);
    } else {
        delete (owner as Record<string, unknown>)[key];
    }
}

function collectEditorExtrasConstructors(root: unknown): Set<any> {
    const tag = getCC().editorExtrasTag || '__editorExtras__';
    const constructors = new Set<any>();
    visitObjectGraph(root, (value) => {
        if (Object.prototype.hasOwnProperty.call(value, tag) && typeof value.constructor === 'function') {
            constructors.add(value.constructor);
        }
    });
    return constructors;
}

function collectSerializedEditorExtrasConstructors(root: unknown): Set<any> {
    const cc = getCC();
    const tag = cc.editorExtrasTag || '__editorExtras__';
    const constructors = new Set<any>();
    visitObjectGraph(root, (value) => {
        if (!Object.prototype.hasOwnProperty.call(value, tag) || typeof value.__type__ !== 'string') {
            return;
        }
        const constructor = cc.js.getClassById?.(value.__type__) || cc.js.getClassByName?.(value.__type__);
        if (constructor) {
            constructors.add(constructor);
        }
    });
    return constructors;
}

function visitObjectGraph(root: unknown, visitor: (value: Record<string, any>) => void): void {
    const pending: unknown[] = [root];
    const visited = new WeakSet<object>();
    while (pending.length) {
        const current = pending.pop();
        if (!current || typeof current !== 'object' || visited.has(current)) {
            continue;
        }
        visited.add(current);
        const object = current as Record<string, any>;
        visitor(object);
        if (ArrayBuffer.isView(current)) {
            continue;
        }
        if (current instanceof Map) {
            for (const [key, value] of current) {
                pending.push(key, value);
            }
            continue;
        }
        if (current instanceof Set) {
            for (const value of current) {
                pending.push(value);
            }
            continue;
        }
        for (const key of Object.keys(object)) {
            try {
                pending.push(object[key]);
            } catch {
                // Ignore engine accessors that are unavailable outside their owning runtime.
            }
        }
    }
}

function getStateComponents(state: any): any[] {
    return state?.components ? Array.from(state.components as Iterable<any>) : [];
}

function getStateType(state: any, stateMachine: any, api: any): AnimationGraphStateView['type'] {
    if (state === stateMachine.entryState) return 'entry';
    if (state === stateMachine.exitState) return 'exit';
    if (state === stateMachine.anyState) return 'any';
    if (state instanceof api.MotionState) return 'motion';
    if (state instanceof api.EmptyState) return 'empty';
    if (state instanceof api.SubStateMachine) return 'sub-state-machine';
    if (state instanceof api.ProceduralPoseState) return 'procedural-pose';
    return 'unknown';
}

function getMotionType(motion: any, api: any): AnimationGraphMotionView['type'] {
    if (motion instanceof api.ClipMotion) return 'clip';
    if (motion instanceof api.AnimationBlend1D) return 'blend-1d';
    if (motion instanceof api.AnimationBlend2D) return 'blend-2d';
    if (motion instanceof api.AnimationBlendDirect) return 'blend-direct';
    return 'unknown';
}

function isBlendMotion(motion: any, api: any): boolean {
    return motion instanceof api.AnimationBlend1D
        || motion instanceof api.AnimationBlend2D
        || motion instanceof api.AnimationBlendDirect;
}

function isStateMachineLike(value: any): boolean {
    return !!value
        && typeof value.states === 'function'
        && typeof value.transitions === 'function';
}

interface PoseNodeEnterInfoLike {
    type: 'state-machine' | 'animation-blend' | 'stash';
    target?: unknown;
    stashName?: string;
}

function getPoseNodeEnterInfo(node: any, api: any): PoseNodeEnterInfoLike | undefined {
    if (typeof node.getEnterInfo === 'function') {
        return node.getEnterInfo();
    }
    // CLI 运行时 EDITOR 为 false，引擎不会安装 if (EDITOR) 守卫内的 getEnterInfo 原型方法，
    // 这里按引擎实现等价推导（pose-nodes/state-machine.ts、use-stashed-pose.ts、
    // play-or-sample-motion-pose-node-shared.ts）。
    const js = getCC().js;
    const stateMachineNodeCtor = js.getClassByName('cc.animation.PoseNodeStateMachine');
    if (stateMachineNodeCtor && node instanceof stateMachineNodeCtor) {
        return { type: 'state-machine', target: node.stateMachine };
    }
    const useStashedPoseCtor = js.getClassByName('cc.animation.PoseNodeUseStashedPose');
    if (useStashedPoseCtor && node instanceof useStashedPoseCtor) {
        return { type: 'stash', stashName: node.stashName };
    }
    if (node.motion && node.motion instanceof api.AnimationBlend) {
        return { type: 'animation-blend', target: node.motion };
    }
    return undefined;
}

function isVec2Like(value: unknown): value is { x: number; y: number } {
    return !!value && typeof value === 'object'
        && typeof (value as { x?: unknown }).x === 'number'
        && typeof (value as { y?: unknown }).y === 'number';
}

function getNodeTitle(node: any): string {
    const title = node.getTitle?.();
    if (typeof title === 'string') {
        return title;
    }
    if (Array.isArray(title) && typeof title[0] === 'string') {
        return title[0];
    }
    return getClassName(node);
}

function getPoseInputDisplayName(key: unknown, metadata: any): string {
    const displayName = metadata?.displayName;
    if (typeof displayName === 'string') {
        return displayName;
    }
    if (Array.isArray(displayName) && typeof displayName[0] === 'string') {
        return displayName[0];
    }
    return Array.isArray(key) ? key.join('.') : String(key);
}

function isInputVisible(node: any, attrs: any): boolean {
    const visible = attrs?.visible;
    if (typeof visible === 'function') {
        return !!visible.call(node);
    }
    return visible === undefined ? true : !!visible;
}

function parsePoseInputId(api: any, inputId: string): any | undefined {
    try {
        const key = JSON.parse(inputId);
        return api.poseGraphOp.isWellFormedInputKey(key) ? key : undefined;
    } catch {
        return undefined;
    }
}

function setPoseInputValue(node: any, inputKey: readonly (string | number)[], value: unknown): void {
    let owner = node;
    for (let index = 0; index < inputKey.length - 1; ++index) {
        const key = inputKey[index];
        if (owner === null || owner === undefined || !(key in Object(owner))) {
            throw new Error(`Pose input path is no longer valid: ${JSON.stringify(inputKey)}`);
        }
        owner = owner[key];
    }
    const key = inputKey[inputKey.length - 1];
    if (key === undefined || owner === null || owner === undefined || !(key in Object(owner))) {
        throw new Error(`Pose input path is no longer valid: ${JSON.stringify(inputKey)}`);
    }
    owner[key] = value;
}

function directProperty(owner: any, key: string, attrs?: Record<string, unknown>): AdapterProperty {
    return {
        get: () => owner[key],
        set: (value) => { owner[key] = value; },
        attrs,
    };
}

function nestedProperty(owner: any, key: string, attrs?: Record<string, unknown>): AdapterProperty {
    return directProperty(owner, key, attrs);
}

function createAdapterBinding(type: string, properties: Record<string, AdapterProperty>): InspectorBinding {
    const holder: Record<string, unknown> = {};
    const value: Record<string, IProperty> = {};
    const propertyCapabilities: Record<string, AnimationGraphInspectorPropertyCapabilities> = {};
    for (const [key, property] of Object.entries(properties)) {
        Object.defineProperty(holder, key, {
            enumerable: true,
            configurable: false,
            get: property.get,
            set: property.set,
        });
        const dump = encodeSerializedObject(property.get(), property.attrs || {}, holder, key);
        dump.path = key;
        value[key] = dump;
        propertyCapabilities[key] = getEncodedPropertyOperationCapabilities(dump, property.attrs);
    }
    const root: IProperty = {
        name: type,
        type,
        value,
        visible: true,
        readonly: false,
        path: '',
    };
    return {
        dump: root,
        propertyCapabilities,
        apply: async (path, patch) => {
            const current = value[path];
            if (!current || !properties[path]) {
                throw new Error(`Unknown property dump path: ${path}`);
            }
            await applyEncodedPropertyPatch(holder, path, current, patch);
        },
        reset: async (path) => {
            const current = value[path];
            const property = properties[path];
            if (!current || !property) {
                throw new Error(`Unknown property dump path: ${path}`);
            }
            applyEncodedPropertyOperation(holder, path, current, property.attrs, 'reset');
        },
        create: async (path) => {
            const current = value[path];
            const property = properties[path];
            if (!current || !property) {
                throw new Error(`Unknown property dump path: ${path}`);
            }
            applyEncodedPropertyOperation(holder, path, current, property.attrs, 'create');
        },
    };
}

function createDecoratedBinding(instance: any, name: string): InspectorBinding {
    const dump = encodePropertyObject(instance, name);
    return {
        dump,
        propertyCapabilities: queryPropertyObjectOperationCapabilities(instance, dump),
        apply: (path, patch) => applyPropertyObjectPatch(instance, path, patch),
        reset: async (path) => applyPropertyObjectOperation(instance, path, 'reset'),
        create: async (path) => applyPropertyObjectOperation(instance, path, 'create'),
    };
}

function assertInspectorBindingPath(path: string, expected: string): void {
    if (path !== expected) {
        throw new Error(`Unknown property dump path: ${path}`);
    }
}

function enumList(enumType: Record<string, string | number>): Array<{ name: string; value: number }> {
    return Object.entries(enumType)
        .filter(([, value]) => typeof value === 'number')
        .map(([name, value]) => ({ name, value: value as number }));
}

function uniqueStateName(stateMachine: any, requested: string): string {
    const names = new Set(Array.from(stateMachine.states() as Iterable<any>).map((state) => state.name));
    if (!names.has(requested)) {
        return requested;
    }
    let index = 1;
    let candidate = `${requested}-${String(index).padStart(3, '0')}`;
    while (names.has(candidate)) {
        index += 1;
        candidate = `${requested}-${String(index).padStart(3, '0')}`;
    }
    return candidate;
}

function uniqueStashName(layer: any): string {
    let index = 1;
    while (layer.getStash(`Stash${index}`)) {
        index += 1;
    }
    return `Stash${index}`;
}

function getPoseGraphContextLayerIndex(context: AnimationGraphPoseGraphContext): number {
    return context.kind === 'layer-stash'
        ? context.layerIndex
        : getStateMachineContextLayerIndex(context.stateMachine);
}

function getStateMachineContextLayerIndex(context: AnimationGraphStateMachineContext): number {
    switch (context.kind) {
        case 'layer-state-machine':
            return context.layerIndex;
        case 'pose-node-state-machine':
            return getPoseGraphContextLayerIndex(context.poseGraph);
        case 'sub-state-machine':
            return getStateMachineContextLayerIndex(context.stateMachine);
    }
}

function defaultStateName(type: AnimationGraphStateView['type'] | import('./@types/public').AnimationGraphStateType): string {
    switch (type) {
        case 'motion': return 'Motion';
        case 'empty': return 'Empty';
        case 'sub-state-machine': return 'State Machine';
        case 'procedural-pose': return 'Pose';
        default: return 'State';
    }
}

function createState(stateMachine: any, type: import('./@types/public').AnimationGraphStateType): any {
    switch (type) {
        case 'motion': return stateMachine.addMotion();
        case 'empty': return stateMachine.addEmpty();
        case 'sub-state-machine': return stateMachine.addSubStateMachine();
        case 'procedural-pose': return stateMachine.addProceduralPoseState();
    }
}

function createBlendItem(parent: any, api: any, motion: any): any {
    let item: any;
    if (parent instanceof api.AnimationBlend1D) {
        item = new api.AnimationBlend1D.Item();
        item.threshold = Array.from(parent.items as Iterable<any>).length;
    } else if (parent instanceof api.AnimationBlend2D) {
        item = new api.AnimationBlend2D.Item();
        item.threshold = new (getCC().Vec2)();
    } else if (parent instanceof api.AnimationBlendDirect) {
        item = new api.AnimationBlendDirect.Item();
    } else {
        throw new Error('Parent motion does not accept children.');
    }
    item.motion = motion;
    return item;
}

function dumpTransitionConditionBinding(binding: any): Record<string, unknown> {
    if (!binding || typeof binding !== 'object') {
        return {};
    }
    const ctor = binding.constructor;
    const result: Record<string, unknown> = {
        __type__: getCC().js.getClassId(ctor) || getClassName(binding),
    };
    const properties = Array.isArray(ctor?.__props__) ? ctor.__props__ : [];
    for (const property of properties) {
        if (typeof property === 'string') {
            result[property] = clonePlain(binding[property]);
        }
    }
    return result;
}

function createTransitionCondition(api: any, type: import('./@types/public').AnimationGraphTransitionConditionType): any {
    switch (type) {
        case 'binary': return new api.BinaryCondition();
        case 'unary': return new api.UnaryCondition();
        case 'trigger': return new api.TriggerCondition();
    }
}

const transitionConditionBindingClasses: readonly string[] = [
    'cc.animation.TCVariableBinding',
    'cc.animation.TCAuxiliaryCurveBinding',
    'cc.animation.TCStateWeightBinding',
    'cc.animation.TCStateMotionTimeBinding',
];

function requireTransitionConditionBindingClass(path: string, value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    const normalized = name.startsWith('cc.animation.') ? name : `cc.animation.${name}`;
    if (!transitionConditionBindingClasses.includes(normalized)) {
        throw new Error(`Transition condition property ${path} expects one of: ${transitionConditionBindingClasses.join(', ')}.`);
    }
    return normalized;
}

function setTransitionConditionProperty(condition: any, path: string, value: unknown, api: any): void {
    if (condition instanceof api.BinaryCondition) {
        switch (path) {
            case 'operator':
                condition.operator = requireIntegerInRange(path, value, 0, 5);
                return;
            case 'rhs':
                condition.rhs = requireFiniteNumber(path, value);
                return;
            case 'lhsBinding.type':
                condition.lhsBinding.type = requireEnumValue(path, value, [
                    api.TCBindingValueType.FLOAT,
                    api.TCBindingValueType.INTEGER,
                ]);
                return;
            case 'lhsBinding.variableName':
                condition.lhsBinding.variableName = requireString(path, value);
                return;
            case 'lhsBinding.curveName':
                condition.lhsBinding.curveName = requireString(path, value);
                return;
            default:
                throw new Error(`Unsupported BinaryCondition property path: ${path}`);
        }
    }
    if (condition instanceof api.UnaryCondition) {
        switch (path) {
            case 'operator':
                condition.operator = requireIntegerInRange(path, value, 0, 1);
                return;
            case 'operand.variable':
                condition.operand.variable = requireString(path, value);
                return;
            default:
                throw new Error(`Unsupported UnaryCondition property path: ${path}`);
        }
    }
    if (condition instanceof api.TriggerCondition) {
        if (path !== 'trigger') {
            throw new Error(`Unsupported TriggerCondition property path: ${path}`);
        }
        condition.trigger = requireString(path, value);
        return;
    }
    throw new Error(`Unsupported transition condition type: ${getClassName(condition)}`);
}

function requireFiniteNumber(path: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Transition condition property ${path} expects a finite number.`);
    }
    return value;
}

function requireIntegerInRange(path: string, value: unknown, min: number, max: number): number {
    const number = requireFiniteNumber(path, value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new Error(`Transition condition property ${path} expects an integer between ${min} and ${max}.`);
    }
    return number;
}

function requireEnumValue(path: string, value: unknown, allowedValues: number[]): number {
    const number = requireFiniteNumber(path, value);
    if (!Number.isInteger(number) || !allowedValues.includes(number)) {
        throw new Error(`Transition condition property ${path} expects one of: ${allowedValues.join(', ')}.`);
    }
    return number;
}

function requireString(path: string, value: unknown): string {
    if (typeof value !== 'string') {
        throw new Error(`Transition condition property ${path} expects a string.`);
    }
    return value;
}

const animationGraph = new AnimationGraphAssetService();

export default animationGraph;
