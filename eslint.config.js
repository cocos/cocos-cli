import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.{js,ts,tsx,vue}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            parser: typescriptParser,
            parserOptions: {
                ecmaFeatures: {
                    modules: false,
                },
            },
            globals: {
                ...globals.node,
                ...globals.commonjs,
                Atomics: 'readonly',
                SharedArrayBuffer: 'readonly',
                EditorExtends: 'readonly',
                cc: 'readonly',
                ccm: 'readonly',
                globalThis: 'readonly',
                // 项目特定的全局类型
                NodeJS: 'readonly',
                UUID: 'readonly',
                FilePath: 'readonly',
                MTime: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': typescript,
        },
        rules: {
            // 引号规则 - 强制使用单引号
            'quotes': ['error', 'single', { 
                'avoidEscape': true,
                'allowTemplateLiterals': true 
            }],
            // 其他常用规则
            'semi': ['error', 'always'],
            'no-unused-vars': 'off', // 关闭基础规则，使用 TypeScript 版本
            '@typescript-eslint/no-unused-vars': ['warn', { 
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_' 
            }],
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'no-empty': ['warn', { 
                'allowEmptyCatch': true 
            }], // 允许空的 catch 块
            
            // TypeScript 特定规则，确保语言服务正常工作
            '@typescript-eslint/no-unused-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            // 允许重复的全局变量定义（当从模块导入时）
            'no-redeclare': 'off',
        },
    },
    {
        files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', '**/test/**/*.{js,ts}'],
        languageOptions: {
            globals: {
                ...globals.jest,
                ...globals.node,
                ...globals.commonjs,
                ...globals.es2022,
            },
        },
        rules: {
            'no-console': 'off', // 测试文件中允许 console
        },
    },
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'build/**',
            'coverage/**',
            '*.min.js',
            '*.bundle.js',
        ],
    },
];
