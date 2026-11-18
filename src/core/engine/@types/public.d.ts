
export interface EngineInfo {
    typescript: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义)
        builtin: string, // 内置引擎地址
        path: string; // 当前使用的 ts 引擎路径
    },
    native: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义)
        builtin: string, // 内置引擎地址
        path: string; // 当前使用的原生引擎路径
    },
    tmpDir: string;
    version: string;
    revision?: string;
}

export * from './config';
export * from './modules';

/** @beta */
export interface EditorMaterialDescriptor {
    supported: boolean; reason?: string; effectName?: string; techniqueCount?: number;
    triangleDepthTechnique?: number; triangleDepthOverride?: boolean;
}
/** @beta */
export interface EditorMaterialCatalog {
    protocolVersion: 1;
    effects: Record<string, EditorMaterialDescriptor>;
}
