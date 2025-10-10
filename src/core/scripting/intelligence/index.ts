import ts from 'typescript';
import ps from 'path';
import fs from 'fs-extra';
import { getDatabaseModuleRootURL } from '../utils/db-module-url';
import { StatsQuery } from '@cocos/ccbuild';
import { configurationManager } from '../../configuration';
import { IAssetDBInfo } from '../../assets/@types/private';
import engine from '../../engine';

export interface DbURLInfo { dbURL: string, target: string }

type TsConfigPaths = Record<string, string[]>;
export class TypeScriptConfigBuilder {
    private _realTsConfigPath: string;
    private _tempDirPath: string;
    private _configFilePath: string;
    private _declarationHomePath: string;
    private _engineTsPath: string;
    private _projectPath: string;

    private internalTsConfig: ts.CompilerOptions = {};
    private internalDbURLInfos: DbURLInfo[] = [];

    constructor(projectPath: string, engineTsPath: string) {
        this._engineTsPath = engineTsPath;
        this._projectPath = projectPath;
        this._realTsConfigPath = ps.join(projectPath, 'tsconfig.json');
        this._tempDirPath = ps.join(projectPath, 'temp');
        this._configFilePath = ps.join(this._tempDirPath, 'tsconfig.cocos.json');
        this._declarationHomePath = ps.join(this._tempDirPath, 'declarations');
    }

    getTempPath(): string {
        return this._tempDirPath;
    }

    getProjectPath(): string {
        return this._projectPath;
    }

    getRealTsConfigPath(): string {
        return this._realTsConfigPath;
    }

    async getInternalDbURLInfos(): Promise<Readonly<DbURLInfo>[]> {
        if (this.internalDbURLInfos.length === 0) {
            const infos = await this.getDbURLInfos();
            this.internalDbURLInfos.length = 0;
            this.internalDbURLInfos.push(...infos);
        }
        return this.internalDbURLInfos;
    }

    async getCompilerOptions(): Promise<Readonly<ts.CompilerOptions>> {
        if (Object.keys(this.internalTsConfig).length === 0) {
            this.buildCommonConfig();
        }
        return this.internalTsConfig;
    }

    async buildCommonConfig() {
        const types: string[] = [];

        const libs = buildLibs();

        const paths: TsConfigPaths = {};

        await Promise.all([
            this.addEngineDeclarations(types),
            this.addEnvDeclarations(types),
            this.addCustomMacroDeclarations(types),
            this.addJsbDeclarations(types),
            this.addDbPathMappings(paths),
        ]);

        await this.updateCustomMacroJS();

        const compilerOptions: Record<string, ts.CompilerOptionsValue> = {
            // Based on ES2015, but may be extended.
            target: 'ES2015',
            module: 'ES2015',

            // True by default.
            strict: true,

            types,

            libs,

            paths,

            // We support legacy decorator proposal.
            experimentalDecorators: true,

            // Most of transpilers are in "isolated modules" mode since they
            // do not analyze type info. So our babel does.
            isolatedModules: true,

            // Our module resolution is close to Node.js one.
            moduleResolution: 'node',

            // Creator do take over the compilation.
            noEmit: true,

            // To avoid case problem on Windows.
            forceConsistentCasingInFileNames: true,
        };

        const tsConfig = {
            // Considering Visual Studio Code identifies tsconfig from schema.
            $schema: 'https://json.schemastore.org/tsconfig',

            compilerOptions,
        };

        for (const key in compilerOptions) {
            this.internalTsConfig[key] = compilerOptions[key];
        }
        this.internalTsConfig.target = ts.ScriptTarget.ES2015;
        this.internalTsConfig.module = ts.ModuleKind.ES2015;
        this.internalTsConfig.moduleResolution = ts.ModuleResolutionKind.NodeJs;

        await fs.outputJson(this._configFilePath, tsConfig, {
            spaces: 2,
        });

        function buildLibs(): string[] | undefined {
            const libs: string[] = [];
            // TODO: add libs
            return libs.length === 0 ? undefined : libs;
        }
    }


    private async addEngineDeclarations(types: string[]) {
        const engineDeclarationFilePath = ps.join(this._declarationHomePath, 'cc.d.ts');
        await fs.outputFile(
            engineDeclarationFilePath,
            generateEngineDeclarationFile(this._engineTsPath),
            { encoding: 'utf8' },
        );
        types.push(this.tsConfigTypePath(engineDeclarationFilePath));
    }

    private async addJsbDeclarations(types: string[]) {
        const jsbDeclarationFilePath = ps.join(this._declarationHomePath, 'jsb.d.ts');
        await fs.outputFile(
            jsbDeclarationFilePath,
            generateJsbDeclarationFile(this._engineTsPath),
            { encoding: 'utf8' },
        );
        types.push(this.tsConfigTypePath(jsbDeclarationFilePath));
    }

    private async addEnvDeclarations(types: string[]) {
        const envDeclarationFilePath = ps.join(this._declarationHomePath, 'cc.env.d.ts');
        await fs.outputFile(
            envDeclarationFilePath,
            await generateEnvDeclarationFile(this._engineTsPath),
            { encoding: 'utf8' },
        );
        types.push(this.tsConfigTypePath(envDeclarationFilePath));
    }

    private async addCustomMacroDeclarations(types: string[]) {
        const customMacroDeclarationFilePath = ps.join(this._declarationHomePath, 'cc.custom-macro.d.ts');
        await fs.outputFile(
            customMacroDeclarationFilePath,
            await generateCustomMacroDeclarationFile(),
            { encoding: 'utf8' },
        );
        types.push(this.tsConfigTypePath(customMacroDeclarationFilePath));
    }

    private async addDbPathMappings(paths: TsConfigPaths) {
        const infos = await this.getDbURLInfos();
        this.internalDbURLInfos.length = 0;
        this.internalDbURLInfos.push(...infos);
        for (const { dbURL, target } of infos) {
            paths[`${dbURL}*`] = [ps.join(target, '*')];
        }
    }

    private tsConfigTypePath(path: string): string {
        // Path is relative from dir of "real" tsconfig.json, not extending tsconfig.json.
        const rel = ps.relative(ps.dirname(this._realTsConfigPath), path);
        // No `.d.ts` is allowed
        const extensionLess = rel.endsWith('.d.ts') ? rel.substr(0, rel.length - 5) : rel;
        // Let's convert it to slash for generic
        const unix = extensionLess.replace(/\\/g, '/');
        // "./" is needed for type field, at least for TS 4.2.3
        return unix.startsWith('./') || unix.startsWith('../') ? unix : `./${unix}`;
    }

    /**
     * 在收到 custom-macro-changed 消息后，更新相关自定义宏配置
     * 包括 cc.custom-macro.d.ts 和 custom-macro.js
     */
    async updateCustomMacro() {
        // 更新 cc.custom-macro.d.ts
        const customMacroDeclarationFilePath = ps.join(this._declarationHomePath, 'cc.custom-macro.d.ts');
        await fs.outputFile(
            customMacroDeclarationFilePath,
            await generateCustomMacroDeclarationFile(),
            { encoding: 'utf8' },
        );

        // 更新 custom-macro.js
        await this.updateCustomMacroJS();
    }

    /**
     * 更新 custom-macro.js 文件，用于 Web 运行时判断
     */
    async updateCustomMacroJS() {
        const customMacroJSFilePath = ps.join(this._tempDirPath, 'programming/custom-macro.js');
        await fs.outputFile(
            customMacroJSFilePath,
            await generateCustomMacroJSFile(),
            { encoding: 'utf8' },
        );
    }


    async getDbURLInfos(): Promise<DbURLInfo[]> {
        const infos: DbURLInfo[] = [];
        const dbInfos = (globalThis as any).assetDBManager.assetDBInfo as Record<string, IAssetDBInfo>;
        const dbInfoValues = Object.values(dbInfos);
        for (const dbInfo of dbInfoValues) {
            const dbURL = getDatabaseModuleRootURL(dbInfo.name);
            infos.push({
                dbURL,
                target: dbInfo.target,
            });
        }
        return infos;
    }
}


function generateEngineDeclarationFile(engineRoot: string) {
    const editorExportDir = ps.join(__dirname, '../../editor-export/');
    const dtsFiles = fs.existsSync(editorExportDir) ? fs.readdirSync(editorExportDir) : [];
    const dtsReferences = dtsFiles.map(file => `/// <reference path="${ps.join(editorExportDir, file)}"/>`).join('\n');

    const code = `
    /// <reference path="${ps.join(engineRoot, 'bin/.declarations/cc.d.ts')}"/>
    ${dtsReferences}
    /**
     * @deprecated Global variable \`cc\` was dropped since 3.0. Use ES6 module syntax to import Cocos Creator APIs.
     */
    declare const cc: never;
    `;

    return code;
}

function generateJsbDeclarationFile(engineRoot: string) {
    const code = `/// <reference path="${ps.join(engineRoot, './@types/jsb.d.ts')}"/>\n`;

    return code;
}

async function generateEnvDeclarationFile(engineRoot: string) {
    const statsQuery = await StatsQuery.create(engineRoot);
    return statsQuery.constantManager.genCCEnv();
}

async function generateCustomMacroDeclarationFile() {

    const customMacroList = engine.getConfig().macroCustom;
    const code = `\
declare module "cc/userland/macro" {
${customMacroList.map((item: any) => `\texport const ${item.key}: boolean;`).join('\n')}
}
`;
    return code;
}

async function generateCustomMacroJSFile() {
    const customMacroList = engine.getConfig().macroCustom;
    const code = `\
System.register([], function (_export, _context) {      
    return {
        setters: [],
        execute: function () {
${customMacroList.map((item: any) => `_export("${item.key}", ${item.value});`).join('\n')}
        }
    };
});
`;
    return code;
}