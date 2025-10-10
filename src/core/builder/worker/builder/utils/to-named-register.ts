import type * as babel from '@babel/core';

function $(
    { types }: typeof babel,
    options: $.Options,
): babel.PluginObj {
    if (!options || !options.name) {
        throw new Error('\'name\' options is required.');
    }

    return {
        visitor: {
            CallExpression: (path) => {
                if (types.isMemberExpression(path.node.callee) &&
                    types.isIdentifier(path.node.callee.object) && path.node.callee.object.name === 'System' &&
                    types.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'register' &&
                    path.node.arguments.length === 2) {
                    path.node.arguments.unshift(types.stringLiteral(options.name));
                }
            },
        },
    };
}

namespace $ {
    export interface Options {
        name: string;
    }
}

export default $;
