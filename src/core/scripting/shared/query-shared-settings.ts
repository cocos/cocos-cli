
import ps from 'path';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import type { ImportMap } from '@cocos/creator-programming-import-maps/lib/import-map';
import type { Logger } from '@cocos/creator-programming-common/lib/logger';
import { existsSync } from 'fs';
import { configurationManager, configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../../configuration';
import Utils from '../../base/utils';

export interface SharedSettings extends Pick<ScriptProjectConfig, 'useDefineForClassFields' | 'allowDeclareFields' | 'loose' | 'guessCommonJsExports' | 'exportsConditions'> {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    importMap?: {
        json: ImportMap;
        url: string;
    };
    preserveSymlinks: boolean;
}

interface ScriptProjectConfig {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    preserveSymlinks: boolean;

    importMap: string;
    previewBrowserslistConfigFile?: string;
}

export function getDefaultSharedSettings(): ScriptProjectConfig {
    return {
        useDefineForClassFields: true,
        allowDeclareFields: true,
        loose: false,
        guessCommonJsExports: false,
        exportsConditions: [],
        preserveSymlinks: false,
        importMap: '',
        previewBrowserslistConfigFile: '',
    };
}

class ScriptConfig {
    private _config: ScriptProjectConfig = getDefaultSharedSettings();
    /**
     * 持有的可双向绑定的配置管理实例
     * TODO 目前没有防护没有 init 的情况
     */
    private _configInstance!: IBaseConfiguration;

    private _init = false;

    async init() {
        if (this._init) {
            return;
        }
        this._configInstance = await configurationRegistry.register('script', getDefaultSharedSettings());
        this._init = true;
    }

    getProject<T>(path?: string, scope?: ConfigurationScope) {
        return this._configInstance.get<T>(path);
    }

    setProject(path: string, value: any, scope?: ConfigurationScope) {
        return this._configInstance.set(path, value, scope);
    }
}

export const scriptConfig = new ScriptConfig();

export async function querySharedSettings(logger: Logger): Promise<SharedSettings> {
    const {
        useDefineForClassFields,
        allowDeclareFields,
        loose,
        guessCommonJsExports,
        exportsConditions,
        importMap: importMapFile,
        preserveSymlinks,
    } = await scriptConfig.getProject<ScriptProjectConfig>();

    let importMap: SharedSettings['importMap'];
    // ui-file 可能因为清空产生 project:// 这样的数据，应视为空字符串一样的处理逻辑
    if (importMapFile && importMapFile !== 'project://') {
        const importMapFilePath = Utils.Path.resolveToRaw(importMapFile);
        if (importMapFilePath && existsSync(importMapFilePath)) {
            try {
                const importMapJson = await fs.readJson(importMapFilePath, { encoding: 'utf8' }) as unknown;
                if (!verifyImportMapJson(importMapJson)) {
                    logger.error('Ill-formed import map.');
                } else {
                    importMap = {
                        json: importMapJson,
                        url: pathToFileURL(importMapFilePath).href,
                    };
                }
            } catch (err) {
                logger.error(`Failed to load import map at ${importMapFile}: ${err}`);
            }
        } else {
            logger.warn(`Import map file not found in: ${importMapFilePath || importMapFile}`);
        }
    }

    return {
        useDefineForClassFields: useDefineForClassFields ?? true,
        allowDeclareFields: allowDeclareFields ?? true,
        loose: loose ?? false,
        exportsConditions: exportsConditions ?? [],
        guessCommonJsExports: guessCommonJsExports ?? false,
        importMap,
        preserveSymlinks: preserveSymlinks ?? false,
    };
}

/**
 * Verify the unknown input value is allowed shape of an import map.
 * This is not parse.
 * @param input 
 * @param logger 
 * @returns 
 */
function verifyImportMapJson(input: unknown): input is ImportMap {
    if (typeof input !== 'object' || !input) {
        return false;
    }

    const verifySpecifierMap = (specifierMapInput: unknown): specifierMapInput is Record<string, string> => {
        if (typeof specifierMapInput !== 'object' || !specifierMapInput) {
            return false;
        }
        for (const value of Object.values(specifierMapInput)) {
            if (typeof value !== 'string') {
                return false;
            }
        }
        return true;
    };

    if ('imports' in input) {
        if (!verifySpecifierMap((input as { imports: unknown }).imports)) {
            return false;
        }
    }
    if ('scopes' in input) {
        for (const value of Object.values(input)) {
            if (!verifySpecifierMap(value)) {
                return false;
            }
        }
    }
    return true;
}

