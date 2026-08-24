import { director, Node, Scene } from 'cc';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import nodeMgr from '../../node/index';
import { createShouldHideInHierarchyCanvasNode } from '../../node/node-create';
import {
    createUndoId,
    failure,
    getEditorExtends,
    getEditorNodeManager,
    getNodePath,
    isNodeInCurrentScene,
    success,
} from './command-utils-shared';

export interface IPrefabPreviewCanvasCommandOptions {
    rootUuid: string;
    rootPath: string;
    rootParentUuid: string | null;
    rootParentPath: string;
    rootSiblingIndex: number;
    previewCanvasUuid: string;
    previewCanvasPath: string;
    removePreviewCanvasOnUndo: boolean;
    workMode: string;
}

export class PrefabPreviewCanvasCommand implements IUndoCommand {
    meta: IUndoCommandMeta;
    private _previewCanvasUuid: string;
    private _previewCanvasPath: string;

    constructor(private readonly _options: IPrefabPreviewCanvasCommandOptions) {
        this.meta = {
            id: createUndoId('prefab-preview-canvas'),
            label: 'Update Prefab Preview Canvas',
            type: 'prefab:preview-canvas',
            scope: { editorType: 'scene' },
            timestamp: Date.now(),
        };
        this._previewCanvasUuid = _options.previewCanvasUuid;
        this._previewCanvasPath = _options.previewCanvasPath;
    }

    async undo(): Promise<IUndoRedoResult> {
        const root = this._findRoot();
        if (!root) {
            return failure(this.meta, `Prefab root not found: ${this._options.rootPath || this._options.rootUuid}`);
        }

        const parent = this._findOriginalParent();
        if (!parent) {
            return failure(this.meta, `Prefab root parent not found: ${this._options.rootParentPath || this._options.rootParentUuid || '/'}`);
        }

        try {
            if (root.parent !== parent) {
                parent.addChild(root);
            }
            if (this._options.rootSiblingIndex >= 0) {
                root.setSiblingIndex(this._options.rootSiblingIndex);
            }

            const previewCanvas = this._findPreviewCanvas();
            if (this._options.removePreviewCanvasOnUndo && previewCanvas?.isValid && root.parent !== previewCanvas) {
                nodeMgr.baseRemoveNode(previewCanvas);
                this._unregisterNodeTree(previewCanvas);
            }

            return success(this.meta);
        } catch (error) {
            return failure(this.meta, error instanceof Error ? error.message : String(error));
        }
    }

    async redo(): Promise<IUndoRedoResult> {
        const root = this._findRoot();
        if (!root) {
            return failure(this.meta, `Prefab root not found: ${this._options.rootPath || this._options.rootUuid}`);
        }

        try {
            let previewCanvas = this._findPreviewCanvas();
            if (!previewCanvas) {
                const scene = director.getScene() as Scene | null;
                if (!scene) {
                    return failure(this.meta, 'Scene not found');
                }
                previewCanvas = await createShouldHideInHierarchyCanvasNode(scene, this._options.workMode);
                this._previewCanvasUuid = previewCanvas.uuid;
                this._previewCanvasPath = getNodePath(previewCanvas);
            }

            if (root.parent !== previewCanvas) {
                previewCanvas.addChild(root);
            }
            return success(this.meta);
        } catch (error) {
            return failure(this.meta, error instanceof Error ? error.message : String(error));
        }
    }

    private _findRoot(): Node | null {
        return this._findNode(this._options.rootUuid, this._options.rootPath);
    }

    private _findPreviewCanvas(): Node | null {
        return this._findNode(this._previewCanvasUuid, this._previewCanvasPath);
    }

    private _findOriginalParent(): Node | null {
        if (this._options.rootParentUuid || this._options.rootParentPath) {
            const parent = this._findNode(this._options.rootParentUuid, this._options.rootParentPath);
            if (parent) {
                return parent;
            }
        }
        return director.getScene() as Node | null;
    }

    private _findNode(uuid: string | null, path: string): Node | null {
        const editorNode = getEditorNodeManager();
        if (uuid) {
            const byUuid = editorNode?.getNode?.(uuid) as Node | null;
            if (isNodeInCurrentScene(byUuid)) {
                return byUuid;
            }
        }

        if (!path || path === '/') {
            const scene = director.getScene() as Node | null;
            return isNodeInCurrentScene(scene) ? scene : null;
        }

        try {
            const byPath = editorNode?.getNodeByPath?.(path) as Node | null;
            return isNodeInCurrentScene(byPath) ? byPath : null;
        } catch (_error) {
            return null;
        }
    }

    private _unregisterNodeTree(node: Node): void {
        const editorNode = getEditorNodeManager();
        const editorComponent = getEditorExtends()?.Component;

        for (const component of node.components ?? []) {
            if (component?.uuid) {
                editorComponent?.remove?.(component.uuid);
            }
        }

        for (const child of node.children ?? []) {
            this._unregisterNodeTree(child);
        }

        if (node.uuid) {
            editorNode?.remove?.(node.uuid);
        }
    }
}
