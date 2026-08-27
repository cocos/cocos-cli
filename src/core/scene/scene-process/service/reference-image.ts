import { Canvas, CCObject, Color, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import {
    IReferenceImageCancelOptions,
    IReferenceImageAuthorityMutation,
    IReferenceImageAuthoritySnapshot,
    IReferenceImageCommitOptions,
    IReferenceImageConfig,
    IReferenceImageConfigItem,
    IReferenceImageError,
    IReferenceImageEvents,
    IReferenceImageItem,
    IReferenceImageParameters,
    IReferenceImagePathOptions,
    IReferenceImagePreviewOptions,
    IReferenceImageService,
    IReferenceImageState,
    IReferenceImageVisibilityOptions,
    ReferenceImageVisibilityReason,
    normalizeReferenceImageConfig,
    validateReferenceImageParameters,
} from '../../common';
import { Rpc } from '../rpc';
import { BaseService, register, Service, ServiceEvents } from './core';
import { messageManager } from './message';

const DEFAULT_CONFIG: IReferenceImageConfig = {
    images: [],
    sceneBindings: {},
    desiredVisible: true,
};

type EditorSession = { uuid: string | null; generation: number };

/**
 * Editor-only reference image overlay. It owns no scene data: all runtime nodes
 * live under Gizmo.backgroundNode and are explicitly DontSave/hidden.
 */
@register('ReferenceImage')
export class ReferenceImageService extends BaseService<IReferenceImageEvents> implements IReferenceImageService {
    private config: IReferenceImageConfig = DEFAULT_CONFIG;
    private currentSceneUuid: string | null = null;
    private canvasNode: Node | null = null;
    private imageNode: Node | null = null;
    private sprite: Sprite | null = null;
    private spriteFrame: SpriteFrame | null = null;
    private loadedPath: string | null = null;
    private missingPaths = new Set<string>();
    private error: IReferenceImageError | null = null;
    /** Last main-process authority revision applied to this Webview's renderer. */
    private authorityRevision: number | null = null;
    private authorityApplyQueue: Promise<void> = Promise.resolve();
    private loadGeneration = 0;
    private activeInteractionId: number | null = null;
    private interactionWatermark = 0;
    private previewPatch: IReferenceImageParameters | null = null;

    async init(): Promise<void> {
        await this.syncFromAuthority(false);
        ServiceEvents.on('scene:dimension-changed', this.onDimensionChanged);
        await this.reconcileCurrentEditor(false);
    }

    async getState(): Promise<IReferenceImageState> {
        await this.syncFromAuthority(false);
        return this.createState();
    }

    async addAndSelect(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        const sceneUuid = this.requireCurrentScene();
        const frame = await this.createSpriteFrameForPath(path);
        frame.destroy();
        return this.mutateAuthority({ type: 'add-and-select', path, sceneUuid }, true);
    }

    async remove(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        this.missingPaths.delete(path);
        return this.mutateAuthority({ type: 'remove', path }, true);
    }

    async select(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        const sceneUuid = this.requireCurrentScene();
        const frame = await this.createSpriteFrameForPath(path);
        frame.destroy();
        return this.mutateAuthority({ type: 'select', path, sceneUuid }, true);
    }

    async clearBinding(): Promise<IReferenceImageState> {
        const sceneUuid = this.requireCurrentScene();
        this.invalidatePreview();
        return this.mutateAuthority({ type: 'clear-binding', sceneUuid }, true, false);
    }

    async setVisible(options: IReferenceImageVisibilityOptions): Promise<IReferenceImageState> {
        if (typeof options?.desiredVisible !== 'boolean') {
            throw new Error('desiredVisible must be a boolean.');
        }
        return this.mutateAuthority({ type: 'set-visible', desiredVisible: options.desiredVisible }, false);
    }

    async refresh(): Promise<IReferenceImageState> {
        await this.syncFromAuthority(false);
        this.invalidatePreview();
        this.error = null;
        await this.loadBoundImage(true);
        this.publishState();
        return this.createState();
    }

    async previewParameters(options: IReferenceImagePreviewOptions): Promise<IReferenceImageState> {
        const interactionId = this.validateInteractionId(options?.interactionId);
        if (interactionId <= this.interactionWatermark
            || (this.activeInteractionId !== null && interactionId < this.activeInteractionId)) {
            return this.createState();
        }
        const patch = this.validateParameters(options?.patch);
        this.requireCurrentImage();
        if (this.activeInteractionId !== interactionId) {
            this.activeInteractionId = interactionId;
            this.previewPatch = null;
        }
        this.previewPatch = { ...this.previewPatch, ...patch };
        this.applyCurrentParameters();
        return this.createState();
    }

    async commitParameters(options: IReferenceImageCommitOptions): Promise<IReferenceImageState> {
        const interactionId = options?.interactionId === undefined ? undefined : this.validateInteractionId(options.interactionId);
        if (interactionId !== undefined && interactionId <= this.interactionWatermark) {
            return this.createState();
        }
        const patch = this.validateParameters(options?.patch);
        const sceneUuid = this.requireCurrentScene();
        this.requireCurrentImage();
        this.closeInteraction(interactionId);
        this.error = null;
        return this.mutateAuthority({ type: 'commit-parameters', sceneUuid, patch }, false, false, true);
    }

    async cancelPreview(options: IReferenceImageCancelOptions): Promise<IReferenceImageState> {
        const interactionId = this.validateInteractionId(options?.interactionId);
        if (interactionId <= this.interactionWatermark) {
            return this.createState();
        }
        this.closeInteraction(interactionId);
        this.applyCurrentParameters();
        return this.createState();
    }

    onEditorOpened(): void {
        void this.reconcileCurrentEditor(true);
    }

    onEditorClosed(): void {
        this.currentSceneUuid = null;
        this.invalidatePreview();
        this.clearRuntime(true);
        this.error = null;
        this.publishState();
    }

    private onDimensionChanged = (): void => {
        void this.handleDimensionChanged();
    };

    private async handleDimensionChanged(): Promise<void> {
        if (this.is2D()) {
            await this.loadBoundImage();
        }
        this.applyVisibility();
        this.publishState();
    }

    /** Socket entrypoint and active pull path; failures stay observable without unhandled rejections. */
    async syncFromAuthority(publish = true): Promise<void> {
        try {
            const snapshot = await Rpc.getInstance().request('referenceImageStore', 'getSnapshot');
            await this.enqueueAuthoritySnapshot(snapshot, publish);
        } catch (error) {
            this.error = { stage: 'config', message: error instanceof Error ? error.message : String(error) };
            console.warn('[ReferenceImage] failed to synchronize authority:', error);
        }
    }

    private async reconcileCurrentEditor(publish: boolean): Promise<void> {
        const nextSceneUuid = this.getEditorSession().uuid;
        if (nextSceneUuid !== this.currentSceneUuid) {
            this.currentSceneUuid = nextSceneUuid;
            this.invalidatePreview();
            this.clearRuntime(true);
            this.error = null;
        }
        await this.syncFromAuthority(false);
        await this.loadBoundImage();
        if (publish) this.publishState();
    }

    private async loadBoundImage(force = false): Promise<void> {
        const path = this.getCurrentPath();
        if (!path || !this.currentSceneUuid || !this.is2D() || !this.config.desiredVisible) {
            this.clearRuntime(false);
            this.applyVisibility();
            return;
        }
        if (!force && this.loadedPath === path && this.spriteFrame) {
            this.applyCurrentParameters();
            return;
        }
        const session = this.getEditorSession();
        const generation = ++this.loadGeneration;
        let dataUrl: string;
        try {
            dataUrl = await this.readDataUrl(path);
        } catch (error) {
            if (generation !== this.loadGeneration || !this.isSessionCurrent(session)) return;
            this.missingPaths.add(path);
            this.error = { stage: 'file', message: error instanceof Error ? error.message : String(error) };
            this.clearRuntime(false);
            this.applyVisibility();
            return;
        }
        try {
            const frame = await this.createSpriteFrame(dataUrl);
            if (generation !== this.loadGeneration || !this.isSessionCurrent(session) || path !== this.getCurrentPath()) {
                frame.destroy();
                return;
            }
            this.error = null;
            this.missingPaths.delete(path);
            this.replaceSpriteFrame(frame, path);
            this.applyCurrentParameters();
        } catch (error) {
            if (generation !== this.loadGeneration || !this.isSessionCurrent(session)) return;
            this.missingPaths.delete(path);
            this.error = { stage: 'decode', message: error instanceof Error ? error.message : String(error) };
            this.clearRuntime(false);
            this.applyVisibility();
        }
    }

    private async createSpriteFrameForPath(path: string): Promise<SpriteFrame> {
        return this.createSpriteFrame(await this.readDataUrl(path));
    }

    private async readDataUrl(path: string): Promise<string> {
        return Rpc.getInstance().request('referenceImageFiles', 'readDataUrl', [path]);
    }

    private createSpriteFrame(dataUrl: string): Promise<SpriteFrame> {
        const ImageCtor = (globalThis as any).ccwindow?.Image ?? (globalThis as any).Image;
        if (!ImageCtor) {
            return Promise.reject(new Error('Image decoding is unavailable in the scene editor.'));
        }
        return new Promise((resolve, reject) => {
            const image = new ImageCtor();
            image.onload = () => {
                try {
                    resolve(SpriteFrame.createWithImage(image));
                } catch (error) {
                    reject(error);
                }
            };
            image.onerror = () => reject(new Error('Reference image decoding failed.'));
            image.src = dataUrl;
        });
    }

    private ensureNodes(): void {
        if (this.sprite && this.imageNode && this.canvasNode) return;
        const background = Service.Gizmo.backgroundNode;
        if (!background) throw new Error('Editor gizmo background is unavailable.');
        const flags = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
        const layer = Layers.Enum.GIZMOS | Layers.Enum.UI_2D | Layers.Enum.IGNORE_RAYCAST;
        this.canvasNode = new Node('Reference Image Canvas');
        this.canvasNode.objFlags |= flags;
        this.canvasNode.layer = layer;
        this.canvasNode.parent = background;
        this.canvasNode.addComponent(Canvas);

        this.imageNode = new Node('Reference Image');
        this.imageNode.objFlags |= flags;
        this.imageNode.layer = layer;
        this.imageNode.parent = this.canvasNode;
        this.imageNode.addComponent(UITransform);
        this.sprite = this.imageNode.addComponent(Sprite);
    }

    private replaceSpriteFrame(frame: SpriteFrame, path: string): void {
        this.ensureNodes();
        const previous = this.spriteFrame;
        this.spriteFrame = frame;
        this.loadedPath = path;
        this.sprite!.spriteFrame = frame;
        if (previous && previous !== frame) previous.destroy();
    }

    private clearRuntime(destroyNodes: boolean): void {
        this.loadGeneration++;
        if (this.sprite) this.sprite.spriteFrame = null;
        if (this.spriteFrame) this.spriteFrame.destroy();
        this.spriteFrame = null;
        this.loadedPath = null;
        if (destroyNodes && this.canvasNode) {
            this.canvasNode.destroy();
            this.canvasNode = null;
            this.imageNode = null;
            this.sprite = null;
        }
    }

    private applyCurrentParameters(): void {
        const parameters = this.getCurrentParameters();
        if (!parameters || !this.imageNode || !this.sprite) {
            this.applyVisibility();
            return;
        }
        this.imageNode.setPosition(parameters.x, parameters.y, 0);
        this.imageNode.setScale(parameters.scaleX, parameters.scaleY, 1);
        const color = this.sprite.color.clone();
        color.a = Math.round(parameters.opacity / 100 * 255);
        this.sprite.color = color;
        this.applyVisibility();
        void Service.Engine.repaintInEditMode();
    }

    private applyVisibility(): void {
        if (this.imageNode) this.imageNode.active = this.computeVisibility().effectiveVisible;
        void Service.Engine.repaintInEditMode();
    }

    private computeVisibility(): { effectiveVisible: boolean; reason: ReferenceImageVisibilityReason } {
        if (!this.currentSceneUuid) return { effectiveVisible: false, reason: 'no-editor' };
        if (!this.config.desiredVisible) return { effectiveVisible: false, reason: 'disabled' };
        if (!this.is2D()) return { effectiveVisible: false, reason: 'not-2d' };
        const path = this.getCurrentPath();
        if (!path) return { effectiveVisible: false, reason: 'unbound' };
        if (this.missingPaths.has(path)) return { effectiveVisible: false, reason: 'missing' };
        if (this.error) return { effectiveVisible: false, reason: 'load-error' };
        if (!this.spriteFrame || this.loadedPath !== path) return { effectiveVisible: false, reason: 'load-error' };
        return { effectiveVisible: true, reason: 'visible' };
    }

    private createState(): IReferenceImageState {
        const visibility = this.computeVisibility();
        const currentPath = this.getCurrentPath();
        const images = this.config.images.map((image) => ({ ...image, missing: this.missingPaths.has(image.path) }));
        const image = currentPath ? images.find((candidate) => candidate.path === currentPath) ?? null : null;
        return {
            images,
            current: { sceneUuid: this.currentSceneUuid, imagePath: currentPath, image },
            desiredVisible: this.config.desiredVisible,
            effectiveVisible: visibility.effectiveVisible,
            visibilityReason: visibility.reason,
            is2D: this.is2D(),
            hasOpenEditor: this.currentSceneUuid !== null,
            error: this.error,
        };
    }

    private getCurrentPath(): string | null {
        return this.currentSceneUuid ? this.config.sceneBindings[this.currentSceneUuid] ?? null : null;
    }

    private requireCurrentScene(): string {
        if (!this.currentSceneUuid) throw new Error('No scene or prefab is currently open.');
        return this.currentSceneUuid;
    }

    private requireCurrentImage(): IReferenceImageConfigItem {
        const path = this.getCurrentPath();
        const image = path ? this.config.images.find((candidate) => candidate.path === path) : undefined;
        if (!image) throw new Error('The current scene or prefab has no reference image binding.');
        return image;
    }

    private getCurrentParameters(): IReferenceImageConfigItem | null {
        const image = this.getCurrentPath()
            ? this.config.images.find((candidate) => candidate.path === this.getCurrentPath())
            : undefined;
        return image ? { ...image, ...this.previewPatch } : null;
    }

    private async mutateAuthority(
        mutation: IReferenceImageAuthorityMutation,
        invalidatePreview: boolean,
        clearError = true,
        applyRuntimeOnNoop = false,
    ): Promise<IReferenceImageState> {
        const snapshot = await Rpc.getInstance().request('referenceImageStore', 'mutate', [mutation]);
        if (invalidatePreview) this.invalidatePreview();
        if (clearError && snapshot.changed) this.error = null;
        const applied = await this.enqueueAuthoritySnapshot(snapshot, snapshot.changed);
        if (applyRuntimeOnNoop && !snapshot.changed && !applied) this.applyCurrentParameters();
        return this.createState();
    }

    private async enqueueAuthoritySnapshot(snapshot: IReferenceImageAuthoritySnapshot, publish: boolean): Promise<boolean> {
        let resolveTask!: (applied: boolean) => void;
        let rejectTask!: (reason: unknown) => void;
        const result = new Promise<boolean>((resolve, reject) => {
            resolveTask = resolve;
            rejectTask = reject;
        });
        this.authorityApplyQueue = this.authorityApplyQueue
            .catch(() => undefined)
            .then(async () => {
                try {
                    resolveTask(await this.applyAuthoritySnapshot(snapshot, publish));
                } catch (error) {
                    rejectTask(error);
                }
            });
        return result;
    }

    private async applyAuthoritySnapshot(snapshot: IReferenceImageAuthoritySnapshot, publish: boolean): Promise<boolean> {
        if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
            throw new Error('Reference image authority returned an invalid snapshot.');
        }
        // A socket notification may arrive before the RPC response that caused it.
        // Never let an older or already-applied response roll the renderer back.
        if (this.authorityRevision !== null && snapshot.revision <= this.authorityRevision) {
            return false;
        }
        this.config = normalizeReferenceImageConfig(snapshot.config);
        this.authorityRevision = snapshot.revision;
        this.invalidatePreview();
        await this.loadBoundImage();
        if (publish) this.publishState();
        return true;
    }

    private publishState(): void {
        const state = this.createState();
        this.broadcast('reference-image:state-changed', state);
        messageManager.broadcast('reference-image:state-changed', state);
    }

    private invalidatePreview(): void {
        this.interactionWatermark = Math.max(this.interactionWatermark, (this.activeInteractionId ?? 0) + 1);
        this.activeInteractionId = null;
        this.previewPatch = null;
    }

    private closeInteraction(interactionId?: number): void {
        this.interactionWatermark = Math.max(this.interactionWatermark, interactionId ?? this.activeInteractionId ?? 0);
        this.activeInteractionId = null;
        this.previewPatch = null;
    }

    private validatePath(path: unknown): string {
        if (typeof path !== 'string' || !path) throw new Error('Reference image path is required.');
        return path;
    }

    private validateInteractionId(value: unknown): number {
        if (!Number.isSafeInteger(value) || (value as number) <= 0) {
            throw new Error('interactionId must be a positive safe integer.');
        }
        return value as number;
    }

    private validateParameters(patch: unknown): IReferenceImageParameters {
        return validateReferenceImageParameters(patch);
    }

    private is2D(): boolean {
        try {
            return Boolean(Service.Camera.is2D);
        } catch {
            return false;
        }
    }

    private getEditorSession(): EditorSession {
        const editor = Service.Editor as unknown as { getEditorSession?: () => EditorSession };
        return editor.getEditorSession?.() ?? { uuid: null, generation: 0 };
    }

    private isSessionCurrent(session: EditorSession): boolean {
        const editor = Service.Editor as unknown as { isCurrentEditorSession?: (value: EditorSession) => boolean };
        return editor.isCurrentEditorSession?.(session) ?? session.uuid === this.getEditorSession().uuid;
    }
}
