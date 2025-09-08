module.exports = {
    'root': true,
    'env': {
        'browser': true,
        'commonjs': true,
        'es6': true,
        'node': true,
        'mocha': true,
        'jest': true,
    },
    'extends': [
        'eslint:recommended',
        'plugin:vue/recommended',
        'plugin:@typescript-eslint/recommended',
        '@cocos-fe/eslint-config/editor',
    ],
    'globals': {
        'Atomics': 'readonly',
        'SharedArrayBuffer': 'readonly',
        'Editor': 'readonly',
        'EditorExtends': 'readonly',
        'Tester': 'readonly', // 编辑器测试框架在 windows 上挂的工具，后期应该也用模块导出 TODO
        'cc': 'readonly',
        'globalThis': 'readonly',
    },
    'parser': 'vue-eslint-parser',
    'parserOptions': {
        'parser': '@typescript-eslint/parser',
        'ecmaVersion': 6,
        'sourceType': 'module',
        'ecmaFeatures': {
            'modules': true,
        },
    },
    'plugins': [
        '@typescript-eslint',
    ],
    'rules': {
        // 原则上我们各个项目不应该单独定制 rules，想加什么规则请和团队确认。
    },
};
