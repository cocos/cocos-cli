/// <reference path="../@types/systemjs/systemjs.d.ts"/>
/// <reference path="../@types/systemjs/extras/named-register.d.ts"/>

import {
    systemJSPrototype,
    systemJsCommon,
    setResolutionDetailMap,
    createDetailResolver,
    // @ts-ignore
} from '../../static/executor/systemjs-bridge/out';
import NodeUrl from 'url';
import { i18nTranslate } from '../../../assets/asset-handler/utils';
import type { ResolutionDetailMap } from '@cocos/creator-programming-quick-pack/lib/resolution-detail-map';

type SystemJsRegistry = Record<string, ModuleRegister>;

type InstantiationHandler = (url: string) => ModuleRegister | undefined | Promise<ModuleRegister | undefined>;

export class ExecutorSystem {
    public static readonly protocolHeadModsMgr = 'mods-mgr:';

    private _registry: SystemJsRegistry = Object.create(null);
    private _vendorRegisterFn: Function;
    private _lastRegister: ModuleRegister | null = null;
    private _baseUrl = 'project:///';
    private _instantiationHandlers: InstantiationHandler[] = [];
    private _detailResolve: (specifier: string, importer?: string) => void;

    constructor() {
        const me = this;
        if (!systemJSPrototype.prepareImport) {
            systemJSPrototype.prepareImport = () => {};
        }
        systemJSPrototype.resolve = function (...args: any) {
            // @ts-ignore
            return me._resolve(this, ...args);
        };
        systemJSPrototype.instantiate = function (...args: any) {
            // @ts-ignore
            return me._instantiate(this, ...args);
        };
        this._vendorRegisterFn = systemJSPrototype.register;
        systemJSPrototype.register = function (...args: any) {
            if (typeof args[0] === 'string') {
                // @ts-ignore
                return me.setRegister(...args);
            }
            // @ts-ignore
            return me._register(this, ...args);
        };
        this._detailResolve = createDetailResolver(
            undefined, // logger,
            undefined, // rejector
        );

        // TODO: merge systemjs implementation
        const upvalueMap: any = {};
        const vendorCreateContext = systemJSPrototype.createContext;
        systemJSPrototype.createContext = function (id: string): any {
            const name2class: any = {};
            const context = vendorCreateContext.call(this, id);
            upvalueMap[context.url] = name2class;
            return {
                ...context,
                upvalue (name: string) {
                    return function (target: any) {
                        name2class[name] = target;
                    }
                }
            };
        };
    }

    get importMap() {
        return this._importMap;
    }

    async import(url: string): Promise<unknown> {
        return await System.import(url);
    }

    /**
     * Provides the last anonymous `System.register` call.
     */
    getRegister() {
        const lastRegister = this._lastRegister;
        this._lastRegister = null;
        return lastRegister;
    }

    clearImportMap() {
        this._importMap.imports = {};
        this._importMap.scopes = {};
    }

    extendImportMap(importMap: ImportMap, baseUrl: string) {
        systemJsCommon.resolveAndComposeImportMap(importMap, baseUrl, this._importMap);
    }

    setRegister(id: string, dependencies: string[], declare: Declare) {
        this._registry[id] = [dependencies, declare];
    }

    deleteRegister(id: string) {
        delete this._registry[id];
    }

    encodeModsMgrRequest(id: string) {
        const url = `${ExecutorSystem.protocolHeadModsMgr}${encodeURIComponent(id)}`;
        return url;
    }

    addInstantiationHandler(handler: InstantiationHandler) {
        this._instantiationHandlers.push(handler);
    }

    setResolutionDetailMap(resolutionDetailMap: ResolutionDetailMap, url: string) {
        console.debug(`Set detail map ${url}: ${JSON.stringify(resolutionDetailMap, undefined, 2)}`);
        setResolutionDetailMap(resolutionDetailMap, url);
    }

    private _importMap: ImportMap & {
        imports: NonNullable<ImportMap['imports']>;
        scopes: NonNullable<ImportMap['scopes']>;
    } = {
        imports: {},
        scopes: {},
    };

    private _resolve(
        systemJSPrototype: SystemJsPrototype,
        id: string,
        parentURL?: string,
    ): string {
        parentURL = parentURL ?? this._baseUrl;

        this._detailResolve(id, parentURL);

        const result = systemJsCommon.resolveImportMap(
            this._importMap,
            systemJsCommon.resolveIfNotPlainOrUrl(id, parentURL) || id,
            parentURL,
        );

        if (result) {
            return result;
        }

        if (id in this._registry) {
            return id;
        }

        return this._throwUnresolved(id, parentURL);
    }

    private async _instantiate(
        systemJSPrototype: SystemJsPrototype,
        url: string,
        firstParentUrl: string,
    ): Promise<ModuleRegister> {
        if (url in this._registry) {
            // TODO: this._registry[url] = null;
            return this._registry[url];
        }

        for (const handler of this._instantiationHandlers) {
            const register = await handler(url);
            if (register) {
                return register;
            }
        }

        let path: string | undefined;
        if (url.startsWith('file:')) {
            try {
                path = NodeUrl.fileURLToPath(url);
            } catch { }
        }

        if (url.startsWith(ExecutorSystem.protocolHeadModsMgr)) {
            const urlObject = new URL(url);
            const pathname = urlObject.pathname;
            const id = decodeURIComponent(pathname);
            return [[], (exportBindings): DeclareResult => {
                return {
                    execute: () => {
                        const modsMgr = require('cc/mods-mgr');
                        const mod = modsMgr.syncImport(id);
                        exportBindings(mod);
                    },
                };
            }];
        }

        if (path) {
            require(path);
            const register = this.getRegister();
            if (!register) {
                throw new Error(i18nTranslate('executor_system_js_no_module_registered', { url }));
            }
            return register;
        }

        return this._throwInstantiationError(url, firstParentUrl);
    }

    /**
     * 处理 `System.register()` 调用。
     */
    private _register(systemJSPrototype: SystemJsPrototype, deps: string[], declare: Declare) {
        this._lastRegister = [deps, declare];
    }

    private _throwUnresolved(id: string, parentUrl?: string): string {
        throw Error(i18nTranslate('executor_failed_to_resolve',
            { specifier: id, parentURL: parentUrl ?? i18nTranslate('executor_system_js_origin') }));
    }

    private _throwInstantiationError(url: string, firstParentUrl: string): ModuleRegister {
        throw Error(i18nTranslate('executor_failed_to_instantiate',
            { url, firstParentURL: firstParentUrl ?? i18nTranslate('executor_system_js_origin') }));
    }
}

interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export const globalEditorSystem = new ExecutorSystem();

