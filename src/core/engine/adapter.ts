import type { EditorMaterialCatalog } from './@types/public';
/** Protocol for CLI-owned engine backends. Discovery never imports engine code. */
export interface EngineBackendIdentity { path: string; version: string; revision?: string }
export interface EngineRuntimeConfiguration {
    engineRoot: string; engineDev: string; editorExports: string; editorLoader: string; webLoader: string;
    webAdapter: string; engineAdapter: string | null; declarations: string; editorDeclarations: string;
    requiredModules: string[]; requiresEditorMode?: boolean; screenEventsModule?: string; runtimeCompatibilityModule?: string;
}
export interface EngineCapability {
    status: 'ready' | 'missing' | 'unverified' | 'not-implemented';
    missing: string[]; reason: string;
}
export interface EngineBackendInspection {
    id: string | null; protocolVersion: number; implementationVersion?: string;
    runtimeSupport: 'implemented' | 'experimental' | 'discovery-only' | 'unsupported';
    validation: 'static-only' | 'discovery-only'; runtimeInterfaces: 'not-tested';
    layout: EngineRuntimeConfiguration | null; capabilities: Record<string, EngineCapability>;
    errors: { code: string; message: string }[];
}
export interface EngineBackendAdapter {
    id: string; protocolVersion: number; implementationVersion: string;
    runtimeSupport: 'implemented' | 'experimental' | 'discovery-only';
    supports(version: string): boolean;
    runtime(selection: EngineBackendIdentity): EngineRuntimeConfiguration;
    compile(selection: EngineBackendIdentity): { directory: string; version: string; compilerSource: string | null; compilerModule: string };
    inspect(selection: EngineBackendIdentity, policy?: unknown): Omit<EngineBackendInspection, 'id' | 'protocolVersion' | 'implementationVersion' | 'runtimeSupport' | 'errors'>;
    requiredFiles?(selection: EngineBackendIdentity, profile: 'source' | 'runtime' | 'web'): string[];
    validatePreparation?(selection: EngineBackendIdentity, profile: 'source' | 'runtime' | 'web'): void;
    configureRuntime?(engine: unknown, getModule: (id: string) => unknown, host?: { getLastSelected(type: string): string; queryAssetInfo?(uuid: string): unknown | Promise<unknown> }): void;
    resolveSerializedAssetFile?(requestedFile: string): string | undefined;
    getPreviewScriptPackages?(): string[];
    getEditorMaterials(selection: EngineBackendIdentity): EditorMaterialCatalog;
    getEditorI18nFallbacks?(lang: string): Record<string, unknown>;
    resolveAssetTemplate?(template: string, selection?: EngineBackendIdentity): string;
    validateRuntime(engine: unknown, selection?: EngineBackendIdentity): void;
}
const backend = require('../../../adapters/engine/registry.cjs') as {
    getEngineBackendAdapter(selection: EngineBackendIdentity): EngineBackendAdapter;
    inspectEngineBackend(selection: EngineBackendIdentity): EngineBackendInspection;
};
export const getEngineBackendAdapter = backend.getEngineBackendAdapter;
export const inspectEngineBackend = backend.inspectEngineBackend;
