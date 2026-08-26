export * from './core/decorator';
export * from './editor';
export * from './node';
export * from './script';
export * from './asset';
import './effect';
export * from './component';
export * from './engine';
export * from './animation';
export * from './prefab';
export * from './selection';
export * from './operation';
export * from './undo';
export * from './redo';
export * from './camera';
export * from './gizmo';
export * from './scene-view';
export * from './particle';
export * from './preview';
export * from './ui';
// Keep a runtime export so the web Scene bundle follows this decorator
// registration module instead of replacing its CommonJS side-effect import
// with an empty tree-shaken namespace.
export { ReferenceImageService } from './reference-image';
export * from './core/global-events';
