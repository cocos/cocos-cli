import * as babel from '@babel/core';

export async function transformPluginScript(code: string, options: transformPluginScript.Options) {
    // 模拟 babel 的 auto compact 行为，超过 500kb 不开启 compact 选项
    // babel compact 选项默认传入 'auto'，当脚本超过 500 kb 时，会有报错提示，影响用户体验
    const autoCompact = code.length > 500000 ? false : true;
    const babelResult = await babel.transformAsync(code, {
        compact: autoCompact,
        plugins: [[wrapPluginScript(options)]],
    });
    if (!babelResult) {
        return {
            code,
        };
    }
    return {
        code: babelResult.code as string,
    };
}

const wrapPluginScript = (options: transformPluginScript.Options): babel.PluginObj => {
    const programBodyTemplate = babel.template.statements(
        `(function(root) {
    %%HIDE_COMMONJS%%;
    %%HIDE_AMD%%;
    %%SIMULATE_GLOBALS%%;
    (function() {
        %%ORIGINAL_CODE%%
    }).call(root);
})(
    // The environment-specific global.
    (function() {
        if (typeof globalThis !== 'undefined') return globalThis;
        if (typeof self !== 'undefined') return self;
        if (typeof window !== 'undefined') return window;
        if (typeof global !== 'undefined') return global;
        if (typeof this !== 'undefined') return this;
        return {};
    }).call(this),
);
`,
        {
            preserveComments: true,
            // @ts-ignore
            syntacticPlaceholders: true,
        } as any,
    );

    return {
        visitor: {
            Program: (path, state) => {
                let HIDE_COMMONJS;
                if (options.hideCommonJs) {
                    HIDE_COMMONJS = babel.types.variableDeclaration(
                        'var',
                        ['exports', 'module', 'require'].map((variableName) =>
                            babel.types.variableDeclarator(babel.types.identifier(variableName), babel.types.identifier('undefined')),
                        ),
                    );
                }

                let HIDE_AMD;
                if (options.hideAmd) {
                    HIDE_AMD = babel.types.variableDeclaration(
                        'var',
                        ['define'].map((variableName) =>
                            babel.types.variableDeclarator(babel.types.identifier(variableName), babel.types.identifier('undefined')),
                        ),
                    );
                }

                let SIMULATE_GLOBALS;
                if (options.simulateGlobals && options.simulateGlobals.length !== 0) {
                    SIMULATE_GLOBALS = babel.types.variableDeclaration(
                        'var',
                        options.simulateGlobals.map((variableName) =>
                            babel.types.variableDeclarator(babel.types.identifier(variableName), babel.types.identifier('root')),
                        ),
                    );
                }

                path.node.body = programBodyTemplate({
                    ORIGINAL_CODE: path.node.body,
                    SIMULATE_GLOBALS,
                    HIDE_COMMONJS,
                    HIDE_AMD,
                });
            },
        },
    };
};
export namespace transformPluginScript {
    export interface Options {
        simulateGlobals: string[];
        hideCommonJs: boolean;
        hideAmd: boolean;
    }
}
