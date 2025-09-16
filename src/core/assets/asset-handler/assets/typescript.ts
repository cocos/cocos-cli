import { Asset } from '@editor/asset-db';
import { ensureDirSync, existsSync, outputFileSync, readdirSync, readFile, statSync } from 'fs-extra';
import { basename, dirname, extname, join } from 'path';
import { openCode } from '../utils';
// import { dirname, normalize } from 'path';
// import * as ts from 'typescript';
import JavascriptHandler from './javascript';
import { DefaultScriptFileNameCheckConfig, ScriptNameChecker, ScriptNameCheckerManager } from './utils/ts-utils';
import { AssetHandler, ICreateMenuInfo } from '../../@types/protected';
import profile from '../../../profile';
import assetConfig from '../../asset-config';
import i18n from '../../../base/i18n';
// import { getCompilerOptions } from './utils/ts-utils';

// const enum TypeCheckLevel {
//     disable = 'disable',
//     checkOnly = 'checkOnly',
//     fatalOnError = 'fatalOnError',
// }

export const TypeScriptHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'typescript',

    // 引擎内对应的类型
    assetType: 'cc.Script',
    open: openCode,
    createInfo: {
        async generateMenuInfo() {
            let menu: ICreateMenuInfo[] = [
                {
                    label: 'i18n:ENGINE.assets.newTypeScript',
                    fullFileName: `${ScriptNameChecker.getDefaultClassName()}.ts`,
                    template: `db://internal/default_file_content/${TypeScriptHandler.name}/ts`,
                    group: 'script',
                    fileNameCheckConfigs: [DefaultScriptFileNameCheckConfig],
                },
            ];
            const templateDir = join(assetConfig.data.root, '.creator/asset-template/typescript');
            // TODO 文件夹初始化应该在点击查看脚本模板时处理
            // ensureDirSync(templateDir);

            const guideFileName = 'Custom Script Template Help Documentation.url';
            const guideFile = join(templateDir, guideFileName);

            if (!existsSync(guideFile)) {
                const content =
                    '[InternetShortcut]\nURL=https://docs.cocos.com/creator/manual/en/scripting/setup.html#custom-script-template';
                outputFileSync(guideFile, content);
            }

            if (existsSync(templateDir)) {
                const names = readdirSync(templateDir);
                const subMenu: ICreateMenuInfo[] = [];
                names.forEach((name: string) => {
                    const filePath = join(templateDir, name);
                    const stat = statSync(filePath);
                    if (stat.isDirectory()) {
                        return;
                    }
                    if (name === guideFileName || name.startsWith('.')) {
                        return;
                    }

                    const baseName = basename(name, extname(name));
                    subMenu.push({
                        label: baseName,
                        fullFileName: (ScriptNameChecker.getValidClassName(baseName) || ScriptNameChecker.getDefaultClassName()) + '.ts',
                        template: filePath,
                        fileNameCheckConfigs: [DefaultScriptFileNameCheckConfig],
                    });
                });
                if (subMenu.length) {
                    subMenu.splice(0, 0, menu[0]);
                    subMenu[0].fullFileName = ScriptNameChecker.getDefaultClassName() + '.ts';
                    menu = [
                        {
                            label: 'i18n:ENGINE.assets.newTypeScript',
                            group: 'script',
                            submenu: subMenu,
                        },
                    ];
                    // TODO 需要转移管理脚本模板入口到偏好设置内
                    subMenu.push({
                        label: i18n.t('assets.menu.setCustomTypeScript'),
                    });
                }
            }
            return menu;
        },
        preventDefaultTemplateMenu: true,
    },

    importer: {
        ...JavascriptHandler.importer,
        async import(asset: Asset) {
            const fileName = asset.source;
            if (fileName.endsWith('.d.ts')) {
                return true;
            }
            let doTypeCheck = false;
            let fatalOnError = false;
            const checkLevel = await getTypeCheckLevel();
            switch (checkLevel) {
                case 'checkOnly':
                    doTypeCheck = true;
                    fatalOnError = false;
                    break;
                case 'fatalOnError':
                    doTypeCheck = true;
                    fatalOnError = true;
                    break;
                case 'disable':
                default:
                    doTypeCheck = false;
                    break;
            }

            return JavascriptHandler.importer.import(asset);
        },
    },

    /**
     * 类型检查指定脚本资源。
     * @param asset 要检查的脚本资源。
     * @returns 包含错误返回 `true`，否则返回 `false`。
     */
    // private async _typeCheck(asset: Asset) {
    //     const fileName = asset.source;
    //     const compilerOptions = getCompilerOptions();
    //     const program = ts.createProgram({
    //         rootNames: [fileName],
    //         options: compilerOptions,
    //     });
    //     const sourceFile = program.getSourceFile(fileName);
    //     if (!sourceFile) {
    //         console.debug(`program created in _typeCheck() doesn't contain main entry file?`);
    //         return false;
    //     }
    //     const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
    //     // const diagnostics = program.getSyntacticDiagnostics(sourceFile);
    //     if (!diagnostics || diagnostics.length === 0) {
    //         return false;
    //     }
    //     const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
    //         getCurrentDirectory() {
    //             return dirname(asset.source);
    //         },
    //         getCanonicalFileName(fileName: string) {
    //             return normalize(fileName);
    //         },
    //         getNewLine() {
    //             return '\n';
    //         },
    //     };
    //     let nError = 0;
    //     for (const diagnostic of diagnostics) {
    //         const text = ts.formatDiagnostic(diagnostic, formatDiagnosticsHost);
    //         let printer: undefined | ((text: string) => void);
    //         switch (diagnostic.category) {
    //             case ts.DiagnosticCategory.Error:
    //                 ++nError;
    //                 printer = console.error;
    //                 break;
    //             case ts.DiagnosticCategory.Warning:
    //                 printer = console.warn;
    //                 break;
    //             case ts.DiagnosticCategory.Message:
    //             case ts.DiagnosticCategory.Suggestion:
    //             default:
    //                 printer = console.log;
    //                 break;
    //         }
    //         printer(text);
    //     }
    //     return nError !== 0;
    // }
};

export default TypeScriptHandler;

async function getTypeCheckLevel() {
    const data = await profile.getProject('project', 'general.type_check_level');
    return data;
}

// function CocosScriptFrameTransformer<T extends ts.Node>(compressedUUID: string, basename: string): ts.TransformerFactory<T> {
//     return (context) => {
//         const visit: ts.Visitor = (node) => {
//             if (ts.isSourceFile(node)) {
//                 // `cc._RF.push(window.module || {}, compressed_uuid, basename); // begin basename`;
//                 const ccRFPush = ts.createExpressionStatement(
//                     ts.createCall(
//                         ts.createPropertyAccess(
//                             ts.createPropertyAccess(ts.createIdentifier('cc'), ts.createIdentifier('_RF')),
//                             ts.createIdentifier('push')
//                         ),
//                         undefined, // typeArguments
//                         [
//                             ts.createBinary(
//                                 ts.createPropertyAccess(ts.createIdentifier('window'), ts.createIdentifier('module')),
//                                 ts.SyntaxKind.BarBarToken,
//                                 ts.createObjectLiteral()
//                             ),
//                             ts.createStringLiteral(compressedUUID),
//                             ts.createStringLiteral(basename),
//                         ]
//                     )
//                 );
//                 // `cc._RF.pop(); // end basename`
//                 const ccRFPop = ts.createExpressionStatement(
//                     ts.createCall(
//                         ts.createPropertyAccess(
//                             ts.createPropertyAccess(ts.createIdentifier('cc'), ts.createIdentifier('_RF')),
//                             ts.createIdentifier('pop')
//                         ),
//                         undefined, // typeArguments
//                         []
//                     )
//                 );
//                 const statements = new Array<ts.Statement>();
//                 statements.push(ccRFPush);
//                 statements.push(...(node.statements));
//                 statements.push(ccRFPop);
//                 return ts.updateSourceFileNode(
//                     node,
//                     statements,
//                     node.isDeclarationFile,
//                     node.referencedFiles,
//                     node.typeReferenceDirectives,
//                     node.hasNoDefaultLib,
//                     node.libReferenceDirectives);
//             }
//             return ts.visitEachChild(node, (child) => visit(child), context);
//         };
//         return (node) => ts.visitNode(node, visit);
//     };
// }

// function CocosLibTransformer<T extends ts.Node>(): ts.TransformerFactory<T> {
//     return (context) => {
//         const visit: ts.Visitor = (node) => {
//             if (!ts.isImportDeclaration(node) ||
//                 !node.importClause || // `import "xx";` is ignored.
//                 !ts.isStringLiteral(node.moduleSpecifier) ||
//                 node.moduleSpecifier.text !== 'Cocos3D') {
//                 return ts.visitEachChild(node, (child) => visit(child), context);
//             }
//             const createCC = () => {
//                 return ts.createIdentifier('cc');
//             };
//             const variableDeclarations = new Array<ts.VariableDeclaration>();
//             const makeDefaultImport = (id: ts.Identifier) => {
//                 variableDeclarations.push(ts.createVariableDeclaration(
//                     ts.createIdentifier(id.text),
//                     undefined,
//                     createCC()
//                 ));
//             };
//             const { importClause: { name, namedBindings } } = node;
//             if (name) {
//                 // import xx from 'Cocos3D';
//                 // const xx = cc;
//                 makeDefaultImport(name);
//             }
//             if (namedBindings) {
//                 if (ts.isNamespaceImport(namedBindings)) {
//                     // import * as xx from 'Cocos3D';
//                     // const xx = cc;
//                     makeDefaultImport(namedBindings.name);
//                 } else {
//                     const bindingElements = new Array<ts.BindingElement>();
//                     for (const { name, propertyName } of namedBindings.elements) {
//                         if (propertyName) {
//                             // import { xx as yy } from 'Cocos3D';
//                             // const { xx: yy } = cc;
//                             bindingElements.push(ts.createBindingElement(
//                                 undefined, // ...
//                                 ts.createIdentifier(propertyName.text),
//                                 ts.createIdentifier(name.text)
//                             ));
//                         } else {
//                             // import { xx } from 'Cocos3D';
//                             // const { xx } = cc;
//                             bindingElements.push(ts.createBindingElement(
//                                 undefined, // ...
//                                 undefined,
//                                 ts.createIdentifier(name.text)
//                             ));
//                         }
//                     }
//                     variableDeclarations.push(ts.createVariableDeclaration(
//                         ts.createObjectBindingPattern(bindingElements),
//                         undefined, // type
//                         createCC()
//                     ));
//                 }
//             }
//             if (variableDeclarations.length === 0) {
//                 return undefined;
//             }
//             return ts.createVariableStatement(
//                 [ts.createModifier(ts.SyntaxKind.ConstKeyword)],
//                 variableDeclarations
//             );
//         };
//         return (node) => ts.visitNode(node, visit);
//     };
// }
