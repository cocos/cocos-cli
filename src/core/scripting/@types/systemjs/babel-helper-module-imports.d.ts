
declare module "@babel/helper-module-imports" {
    import type * as babel from '@babel/core';

    export function addNamed(path: babel.Node, name: string, importedSource: string, opts?: {}): babel.types.Node;
}
