/// <reference path="../../../../packages/engine/bin/.declarations/cc.d.ts" />
/// <reference path="../../../../packages/engine/bin/.declarations/cc.editor.d.ts" />

declare module 'cc/polyfill/engine' {
    const polyfill: unknown;
    export default polyfill;
}

declare module 'cc/overwrite' {
    const overwrite: (cc: unknown) => void;
    export default overwrite;
}
