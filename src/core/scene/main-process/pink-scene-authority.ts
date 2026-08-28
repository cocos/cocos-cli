/**
 * Adapter for PinK's scene API.
 *
 * PinK already routes SceneInstance calls to the scene WebView currently shown
 * by the hierarchy.  Keeping this boundary in the extension host is important:
 * the CLI scene worker is a separate process and must not become a second
 * source of truth when an IDE scene editor is available.
 */
export interface IPinkSceneApi {
    getActiveScene(): Promise<any | undefined>;
    queryOpenedScenes(): Promise<any[]>;
    open(urlOrUUID: string, options?: { openEditor?: boolean }): Promise<any>;
}

/**
 * Cross-process authority contract used by the cocos-code utility process.
 * The implementation belongs to PinK and must route the request to the Scene
 * WebView owned by Hierarchy.
 */
export interface ISceneAuthorityRpc {
    request(module: string, method: string, args: unknown[]): Promise<unknown>;
}

function noActiveSceneError(): Error {
    return new Error('No active PinK scene editor. Open a scene in the hierarchy before using scene operations.');
}

export class PinkSceneAuthority {
    private sceneApi: IPinkSceneApi | undefined;
    private authorityRpc: ISceneAuthorityRpc | undefined;
    private ideAuthorityRequired = false;

    /** Marks the current process as the IDE lib facade, not a standalone CLI. */
    expectIdeAuthority(): void {
        this.ideAuthorityRequired = true;
    }

    /** Binds an in-process PinK scene API (primarily useful in unit tests). */
    attach(sceneApi: IPinkSceneApi): { dispose(): void } {
        this.sceneApi = sceneApi;
        this.authorityRpc = undefined;
        return {
            dispose: () => {
                if (this.sceneApi === sceneApi) {
                    this.sceneApi = undefined;
                }
            },
        };
    }

    /** Binds the RPC adapter supplied by the cocos-code utility host. */
    attachRpc(authorityRpc: ISceneAuthorityRpc): { dispose(): void } {
        this.sceneApi = undefined;
        this.authorityRpc = authorityRpc;
        return {
            dispose: () => {
                if (this.authorityRpc === authorityRpc) {
                    this.authorityRpc = undefined;
                }
            },
        };
    }

    /** True means this run is hosted by PinK, even when no scene is active. */
    isHostedByPink(): boolean {
        return this.sceneApi !== undefined || this.authorityRpc !== undefined;
    }

    /** True after the IDE has entered the lib facade lifecycle. */
    requiresIdeAuthority(): boolean {
        return this.ideAuthorityRequired;
    }

    async request<T>(module: string, method: string, args: unknown[] = []): Promise<T> {
        const authorityRpc = this.authorityRpc;
        if (authorityRpc) {
            return authorityRpc.request(module, method, args) as Promise<T>;
        }

        const api = this.sceneApi;
        if (!api) {
            throw new Error('PinK scene authority is unavailable.');
        }

        if (module === 'Editor') {
            return this.requestEditor<T>(api, method, args);
        }

        const scene = await this.getCurrentScene(api);
        switch (module) {
            case 'Node':
                return this.requestNode<T>(scene, method, args);
            case 'Component':
                return this.requestComponent<T>(scene, method, args);
            case 'Prefab':
                return this.requestPrefab<T>(scene, method, args);
            default:
                throw new Error(`PinK scene authority does not support ${module}.${method}.`);
        }
    }

    private async requestEditor<T>(api: IPinkSceneApi, method: string, args: unknown[]): Promise<T> {
        switch (method) {
            case 'open': {
                const params = args[0] as { urlOrUUID: string; includeChildren?: boolean; includeComponents?: boolean };
                const scene = await api.open(params.urlOrUUID, { openEditor: true });
                return this.queryRoot<T>(scene, params);
            }
            case 'queryCurrent': {
                const scene = await this.findCurrentScene(api);
                return scene ? this.queryRoot<T>(scene, {}) : null as T;
            }
            case 'hasOpen':
                return Boolean(await this.findCurrentScene(api)) as T;
            case 'close': {
                const scene = await this.findScene(api, (args[0] as { urlOrUUID?: string } | undefined)?.urlOrUUID);
                if (!scene) return true as T;
                await scene.close();
                return true as T;
            }
            case 'save': {
                const scene = await this.findScene(api, (args[0] as { urlOrUUID?: string } | undefined)?.urlOrUUID);
                if (!scene) throw noActiveSceneError();
                await scene.save();
                // PinK's SceneInstance save API is a command. Do not synthesize
                // a partial IAssetInfo from the SceneInstance identity: MCP's
                // scene-save schema accepts no data, but rejects incomplete
                // asset metadata. A native PinK bridge may return a complete
                // asset descriptor in the future.
                return undefined as T;
            }
            case 'reload':
                throw new Error('Reloading an active PinK scene is not exposed by the PinK scene API.');
            case 'create':
                throw new Error('Creating a scene asset is not exposed by the PinK scene API.');
            default:
                throw new Error(`PinK scene authority does not support Editor.${method}.`);
        }
    }

    private async requestNode<T>(scene: any, method: string, args: unknown[]): Promise<T> {
        const params = args[0] as any;
        switch (method) {
            case 'createByType': return scene.createNodeByType(params) as Promise<T>;
            case 'createByAsset': return scene.createNodeByAsset(params) as Promise<T>;
            case 'delete':
                await scene.deleteNode(params);
                return { path: params.path } as T;
            case 'query': return scene.query(params) as Promise<T>;
            case 'queryNodeTree': return scene.queryNodeTree(params) as Promise<T>;
            case 'setProperty':
                await scene.setProperty(params);
                return true as T;
            case 'getPathByUuid': return this.findPathByUuid(scene, String(params)) as Promise<T>;
            case 'setParent': return this.invoke(scene, 'node', 'set-parent', params) as Promise<T>;
            case 'reorder': return this.invoke(scene, 'node', 'reorder', params) as Promise<T>;
            case 'copy': return this.invoke(scene, 'node', 'copy', params) as Promise<T>;
            case 'paste': return this.invoke(scene, 'node', 'paste', params) as Promise<T>;
            case 'duplicate': return this.invoke(scene, 'node', 'duplicate', params) as Promise<T>;
            case 'cut': return this.invoke(scene, 'node', 'cut', params) as Promise<T>;
            case 'queryClipboardState': return this.invoke(scene, 'node', 'query-clipboard-state') as Promise<T>;
            case 'moveArrayElement': return this.invoke(scene, 'node', 'move-array-element', params) as Promise<T>;
            case 'removeArrayElement': return this.invoke(scene, 'node', 'remove-array-element', params) as Promise<T>;
            case 'changeNodeLock': return this.invoke(scene, 'node', 'change-node-lock', params) as Promise<T>;
            case 'queryNodesByAssetUuid': return this.invoke(scene, 'node', 'query-nodes-by-asset-uuid', params) as Promise<T>;
            case 'queryNodesMissAsset': return this.invoke(scene, 'node', 'query-nodes-miss-asset') as Promise<T>;
            default: throw new Error(`PinK scene authority does not support Node.${method}.`);
        }
    }

    private async requestComponent<T>(scene: any, method: string, args: unknown[]): Promise<T> {
        const params = args[0] as any;
        switch (method) {
            case 'add': return scene.addComponent(params) as Promise<T>;
            case 'remove': return Boolean(await scene.removeComponent(params)) as T;
            case 'query': return scene.query(typeof params === 'string' ? { path: params } : params) as Promise<T>;
            case 'setProperty':
                await scene.setProperty(params);
                return true as T;
            case 'queryAll': {
                const components = await this.invoke(scene, 'component', 'query-all');
                return components.map((component: { name: string }) => component.name) as T;
            }
            case 'recalculateLODGroupBounds':
                return this.invoke(scene, 'component', 'recalculate-lod-group-bounds', params) as Promise<T>;
            case 'insertLOD':
                return this.invoke(scene, 'component', 'insert-lod', params) as Promise<T>;
            case 'eraseLOD':
                return this.invoke(scene, 'component', 'erase-lod', params) as Promise<T>;
            case 'queryLODGroupRelativeHeight':
                return this.invoke(scene, 'component', 'query-lod-group-relative-height', params) as Promise<T>;
            default: throw new Error(`PinK scene authority does not support Component.${method}.`);
        }
    }

    private async requestPrefab<T>(scene: any, method: string, args: unknown[]): Promise<T> {
        const params = args[0] as any;
        switch (method) {
            case 'applyPrefabChanges': return this.invoke(scene, 'prefab', 'apply-changes', params) as Promise<T>;
            case 'createPrefabFromNode': return this.invoke(scene, 'prefab', 'create-prefab', params) as Promise<T>;
            case 'revertToPrefab': return this.invoke(scene, 'prefab', 'revert', params) as Promise<T>;
            case 'unpackPrefabInstance':
                await this.invoke(scene, 'prefab', 'unlink', params);
                return scene.query({ path: params.path }) as Promise<T>;
            case 'isPrefabInstance': {
                const node = await scene.query({ path: params.path });
                return Boolean(node?.__prefab__) as T;
            }
            case 'getPrefabInfo': {
                const node = await scene.query({ path: params.path });
                return (node?.__prefab__ ?? null) as T;
            }
            case 'unlinkPrefab': return this.invoke(scene, 'prefab', 'unlink', params) as Promise<T>;
            default: throw new Error(`PinK scene authority does not support Prefab.${method}.`);
        }
    }

    /**
     * A hierarchy can still display a scene while a non-scene editor has focus,
     * in which case PinK's active-scene API intentionally returns undefined.
     * The hierarchy process is still authoritative, so use its single opened
     * editor scene as the deterministic fallback.
     */
    private async findCurrentScene(api: IPinkSceneApi): Promise<any | undefined> {
        const active = await api.getActiveScene();
        if (active) return active;

        const opened = await api.queryOpenedScenes();
        const editorScenes = opened.filter((scene) => scene?.openEditor !== false);
        if (editorScenes.length === 1) return editorScenes[0];
        if (opened.length === 1) return opened[0];
        return undefined;
    }

    private async getCurrentScene(api: IPinkSceneApi): Promise<any> {
        const scene = await this.findCurrentScene(api);
        if (!scene) throw noActiveSceneError();
        return scene;
    }

    private async findScene(api: IPinkSceneApi, urlOrUUID?: string): Promise<any | undefined> {
        if (!urlOrUUID) return this.findCurrentScene(api);
        const scenes = await api.queryOpenedScenes();
        return scenes.find((scene) => scene.uuid === urlOrUUID || scene.url === urlOrUUID || scene.file === urlOrUUID);
    }

    private queryRoot<T>(scene: any, options: { includeChildren?: boolean; includeComponents?: boolean }): Promise<T> {
        return scene.query({
            path: '',
            includeChildren: options.includeChildren,
            includeComponents: options.includeComponents,
        }) as Promise<T>;
    }

    private invoke(scene: any, target: string, method: string, params?: unknown): Promise<any> {
        return params === undefined ? scene.invoke(target, method) : scene.invoke(target, method, params);
    }

    private async findPathByUuid(scene: any, uuid: string): Promise<string> {
        const root = await scene.queryNodeTree({});
        const visit = (node: any): string | undefined => {
            if (node?.uuid === uuid) return node.path ?? '';
            for (const child of node?.children ?? []) {
                const found = visit(child);
                if (found !== undefined) return found;
            }
            return undefined;
        };
        return visit(root) ?? '';
    }
}

export const pinkSceneAuthority = new PinkSceneAuthority();
