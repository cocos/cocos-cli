export * from './core/decorator';
export * from './editor';
export * from './node';
export * from './script';
export * from './asset';
export * from './terrain';
import './effect';
export * from './component';
export * from './engine';
export * from './animation';
export * from './prefab';
export * from './selection';
// Input services are registered by the private view runtime.
export * from './undo';
export * from './redo';
export * from './particle';
export * from './reflection-probe';
// Keep a runtime export so the web Scene bundle follows this decorator
// registration module instead of replacing its CommonJS side-effect import
// with an empty tree-shaken namespace.
export { ReferenceImageService } from './reference-image';
export { LightProbeBakeService } from './light-probe-bake';
export { LightmapBakeService } from './lightmap-bake';
export * from './core/global-events';
