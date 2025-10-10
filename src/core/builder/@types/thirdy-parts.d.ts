declare module '@babel/plugin-transform-modules-systemjs' {
    import * as babel from '@babel/core';
    
    const $: babel.PluginTarget;

    namespace $ {
        export interface Options {
            systemGlobal?: string;
        }
    }

    export default $;
}