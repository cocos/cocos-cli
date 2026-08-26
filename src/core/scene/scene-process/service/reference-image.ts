import { Canvas, CCObject, Color, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import {
    IReferenceImageCancelOptions,
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
} from '../../common';
import { Rpc } from '../rpc';
import { BaseService, register, Service, ServiceEvents } from './core';
import { messageManager } from './message';

const DEFAULT_CONFIG: IReferenceImageConfig = {
    images: [],
    sceneBindings: {},
    desiredVisible: true,
};

const DEFAULT_IMAGE_PARAMETERS: Omit<IReferenceImageConfigItem, 'path'> = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 100,
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
    private loadGeneration = 0;
    private activeInteractionId: number | null = null;
    private interactionWatermark = 0;
    private previewPatch: IReferenceImageParameters | null = null;

    async init(): Promise<void> {
        await this.loadConfig();
        ServiceEvents.on('scene:dimension-changed', this.onDimensionChanged);
        await this.reconcileCurrentEditor(false);
    }

    async getState(): Promise<IReferenceImageState> {
        return this.createState();
    }

    async addAndSelect(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        const sceneUuid = this.requireCurrentScene();
        const frame = await this.createSpriteFrameForPath(path);
        const existing = this.config.images.find((image) => image.path === path);
        if (!existing) {
            this.config.images.push({ path, ...DEFAULT_IMAGE_PARAMETERS });
        }
        this.config.sceneBindings[sceneUuid] = path;
        this.invalidatePreview();
        this.error = null;
        this.replaceSpriteFrame(frame, path);
        this.applyCurrentParameters();
        await this.persistAndPublish();
        return this.createState();
    }

    async remove(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        const index = this.config.images.findIndex((image) => image.path === path);
        if (index === -1) {
            return this.createState();
        }

        this.config.images.splice(index, 1);
        const currentWasBound = this.currentSceneUuid !== null && this.config.sceneBindings[this.currentSceneUuid] === path;
        for (const [sceneUuid, boundPath] of Object.entries(this.config.sceneBindings)) {
            if (boundPath === path) {
                delete this.config.sceneBindings[sceneUuid];
            }
        }
        if (currentWasBound && this.currentSceneUuid) {
            const next = this.config.images[index] ?? this.config.images[index - 1];
            if (next) {
                this.config.sceneBindings[this.currentSceneUuid] = next.path;
            }
        }
        this.missingPaths.delete(path);
        this.invalidatePreview();
        this.error = null;
        await this.loadBoundImage();
        await this.persistAndPublish();
        return this.createState();
    }

    async select(options: IReferenceImagePathOptions): Promise<IReferenceImageState> {
        const path = this.validatePath(options?.path);
        const sceneUuid = this.requireCurrentScene();
        if (!this.config.images.some((image) => image.path === path)) {
            throw new Error('Reference image is not in the local image library.');
        }
        const frame = await this.createSpriteFrameForPath(path);
        this.config.sceneBindings[sceneUuid] = path;
        this.invalidatePreview();
        this.error = null;
        this.replaceSpriteFrame(frame, path);
        this.applyCurrentParameters();
        await this.persistAndPublish();
        return this.createState();
    }

    async setVisible(options: IReferenceImageVisibilityOptions): Promise<IReferenceImageState> {
        if (typeof options?.desiredVisible !== 'boolean') {
            throw new Error('desiredVisible must be a boolean.');
        }
        if (this.config.desiredVisible === options.desiredVisible) {
            return this.createState();
        }
        this.config.desiredVisible = options.desiredVisible;
        this.error = null;
        if (options.desiredVisible) {
            await this.loadBoundImage();
        }
        this.applyVisibility();
        await this.persistAndPublish();
        return this.createState();
    }

    async refresh(): Promise<IReferenceImageState> {
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
        const current = this.requireCurrentImage();
        const next = { ...current, ...patch };
        const changed = !this.parametersEqual(current, next);
        this.closeInteraction(interactionId);
        this.error = null;
        if (!changed) {
            this.applyCurrentParameters();
            return this.createState();
        }
        Object.assign(current, patch);
        this.applyCurrentParameters();
        await this.persistAndPublish();
        return this.createState();
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

    private async loadConfig(): Promise<void> {
        try {
            const stored = await Rpc.getInstance().request('sceneConfigInstance', 'get', ['referenceImage', 'local']);
            this.config = this.normalizeConfig(stored);
        } catch (error) {
            this.config = { ...DEFAULT_CONFIG, images: [], sceneBindings: {} };
            this.error = { stage: 'config', message: error instanceof Error ? error.message : String(error) };
        }
    }

    private normalizeConfig(value: unknown): IReferenceImageConfig {
        const raw = value && typeof value === 'object' ? value as Partial<IReferenceImageConfig> : {};
        const seen = new Set<string>();
        const images = Array.isArray(raw.images) ? raw.images.flatMap((item) => {
            if (!item || typeof item.path !== 'string' || !item.path || seen.has(item.path)) return [];
            seen.add(item.path);
            try {
                return [{
                    path: item.path,
                    x: this.finiteOrDefault(item.x, 0),
                    y: this.finiteOrDefault(item.y, 0),
                    scaleX: this.finiteOrDefault(item.scaleX, 1),
                    scaleY: this.finiteOrDefault(item.scaleY, 1),
                    opacity: this.opacityOrDefault(item.opacity),
                }];
            } catch {
                return [];
            }
        }) : [];
        const paths = new Set(images.map((image) => image.path));
        const bindings: Record<string, string> = {};
        if (raw.sceneBindings && typeof raw.sceneBindings === 'object') {
            for (const [sceneUuid, imagePath] of Object.entries(raw.sceneBindings)) {
                if (typeof imagePath === 'string' && paths.has(imagePath)) bindings[sceneUuid] = imagePath;
            }
        }
        return { images, sceneBindings: bindings, desiredVisible: raw.desiredVisible !== false };
    }

    private async reconcileCurrentEditor(publish: boolean): Promise<void> {
        const nextSceneUuid = this.getEditorSession().uuid;
        if (nextSceneUuid !== this.currentSceneUuid) {
            this.currentSceneUuid = nextSceneUuid;
            this.invalidatePreview();
            this.clearRuntime(true);
            this.error = null;
        }
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

    private async persistAndPublish(): Promise<void> {
        await Rpc.getInstance().request('sceneConfigInstance', 'set', ['referenceImage', this.config, 'local']);
        this.publishState();
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
        if (!patch || typeof patch !== 'object') throw new Error('Reference image parameters are required.');
        const result: IReferenceImageParameters = {};
        for (const key of ['x', 'y', 'scaleX', 'scaleY', 'opacity'] as const) {
            const value = (patch as Record<string, unknown>)[key];
            if (value === undefined) continue;
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new Error(`${key} must be a finite number.`);
            }
            if (key === 'opacity' && (value < 0 || value > 100)) {
                throw new Error('opacity must be between 0 and 100.');
            }
            result[key] = value;
        }
        if (Object.keys(result).length === 0) throw new Error('At least one reference image parameter is required.');
        return result;
    }

    private parametersEqual(a: IReferenceImageConfigItem, b: IReferenceImageConfigItem): boolean {
        return a.x === b.x && a.y === b.y && a.scaleX === b.scaleX && a.scaleY === b.scaleY && a.opacity === b.opacity;
    }

    private finiteOrDefault(value: unknown, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    private opacityOrDefault(value: unknown): number {
        const opacity = this.finiteOrDefault(value, 100);
        return opacity >= 0 && opacity <= 100 ? opacity : 100;
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
