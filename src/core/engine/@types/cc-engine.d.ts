/// <reference path="../../../../packages/cc-module/cc.d.ts" />

declare module 'cc/polyfill/engine' {
    const polyfill: unknown;
    export default polyfill;
}

declare module 'cc/overwrite' {
    const overwrite: (cc: unknown) => void;
    export default overwrite;
}
