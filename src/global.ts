/**
 * 一些全局路径配置记录
 */

import { join, relative } from 'path';
const { resolveEnginePath } = require('../workflow/engine-path') as { resolveEnginePath: (root: string, explicitPath?: string) => string };

export interface EngineSelection {
    path: string;
    version: string;
    revision?: string;
    source: 'explicit' | 'project' | 'default';
}

let engineOverride: string | undefined;
let selectedEngine: Readonly<EngineSelection> | undefined;

export function setEnginePathOverride(enginePath: string | undefined) {
    if (selectedEngine) throw new Error('Engine selection is already fixed; start a new process to change engines.');
    engineOverride = enginePath === undefined ? undefined : resolveEnginePath(join(__dirname, '..'), enginePath);
}

export function getEnginePathOverride() { return engineOverride; }
export function getEngineSelection() { return selectedEngine; }

export function activateEngine(selection: EngineSelection) {
    if (selectedEngine && (relative(selectedEngine.path, selection.path) !== '' || selectedEngine.version !== selection.version || selectedEngine.revision !== selection.revision)) {
        throw new Error(`Cannot switch Engine SDK in one process: ${selectedEngine.path} -> ${selection.path}. Start a new process.`);
    }
    selectedEngine ??= Object.freeze({ ...selection });
    return selectedEngine;
}

export const GlobalPaths = {
    staticDir: join(__dirname, '../static'),
    workspace: join(__dirname, '..'),
    get enginePath() { return selectedEngine?.path ?? resolveEnginePath(join(__dirname, '..'), engineOverride); },
};

/**
 * CLI 的任务模式
 */
type CLITaskMode = 'hold' | 'simple';

interface IGlobalConfig {
    mode: CLITaskMode;
}

export const GlobalConfig: IGlobalConfig = {
    mode: 'hold',
};
