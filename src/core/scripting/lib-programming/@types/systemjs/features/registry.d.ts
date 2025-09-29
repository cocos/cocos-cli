/// <reference path="../core.d.ts"/>

interface SystemJsPrototype {
    get(id: string): ModuleNamespaceObject;

    set(id: string, module: any): ModuleNamespaceObject;

    has(id: string): boolean;

    delete(id: string): false | (() => void);

    entries(): Iterable<[string, ModuleNamespaceObject]>;

    [x: string]: unknown;
}
