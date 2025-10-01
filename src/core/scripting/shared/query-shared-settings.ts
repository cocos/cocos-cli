
import ps from 'path';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import type { ImportMap } from '@cocos/creator-programming-import-maps/lib/import-map';
import type { Logger } from '@cocos/creator-programming-common/lib/logger';
import { existsSync } from 'fs';
import { configurationManager } from '../../configuration';
import Utils from '../../base/utils';

export interface SharedSettings {
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

export async function querySharedSettings(logger: Logger): Promise<SharedSettings> {
    const [
        useDefineForClassFields,
        allowDeclareFields,
        loose,
        guessCommonJsExports,
        exportsConditions,
        importMapFile,
        preserveSymlinks,
    ] = await Promise.all([
        configurationManager.get('project.script.useDefineForClassFields') as Promise<boolean | undefined>,
        configurationManager.get('project.script.allowDeclareFields') as Promise<boolean | undefined>,
        configurationManager.get('project.script.loose') as Promise<boolean | undefined>,
        false, // Editor.Profile.getProject('project', 'script.guessCommonJsExports') as Promise<boolean | undefined>,
        configurationManager.get('project.script.exportsConditions') as Promise<string[] | undefined>,
        configurationManager.get('project.script.importMap') as Promise<string | undefined>,
        configurationManager.get('project.script.preserveSymlinks') as Promise<boolean | undefined>,
    ]);

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

