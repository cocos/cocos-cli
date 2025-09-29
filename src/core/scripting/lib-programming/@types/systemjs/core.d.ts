
interface SystemJsPrototype {
    import(id: string, parentUrl?: string): Promise<ModuleNamespaceObject>;

    createContext(parentId: string): unknown;

    register(dependencies: string[], declare: Declare): void;

    getRegister(): ModuleRegister;

    resolve(id: string, parentURL?: string): string;

    instantiate(url: string, firstParentUrl?: string): ModuleRegister | Promise<ModuleRegister>;
}

type ModuleNamespaceObject = unknown;

type Declare = (exportBinding: ExportBinding, context: DeclareContext) => DeclareResult;

interface ExportBinding {
    /**
     * The direct form of the export function can be used to export bindings.
     * It returns the set value for ease of use in expressions.
     */
    (name: string, value: any): typeof value;

    /**
     * The bulk form of the export function allows setting an object of exports.
     * This is not just sugar, but improves performance by calling fewer setter functions when used,
     * so should be used whenever possible by implementations over the direct export form.
     */
    (bulk: Record<string, any>): typeof bulk;
}

interface DeclareContext {
    /**
     * This is an object representing the value of import.meta for a module execution.
     * By default it will have `import.meta.url` present in SystemJS.
     */
    meta: unknown;

    /**
     * This is the contextual dynamic import function available to the module as the replacement for `import()`.
     */
    import(id: string): Promise<ModuleNamespaceObject>;
}

interface DeclareResult {
    /**
     * The array of functions to be called whenever one of the bindings of a dependency is updated.
     * It is indexed in the same order as `deps`.
     * Setter functions can be undefined for dependencies that have no exports.
     */
    setters?: Array<(module: ModuleNamespaceObject) => void>;

    /**
     * This is called at the exact point of code execution,
     * while the outer wrapper is called early,
     * allowing the wrapper to export function declarations before execution.
     */
    execute: () => void | Promise<void>;
}

type ModuleRegister = [string[], Declare];

declare const System: SystemJsPrototype;
