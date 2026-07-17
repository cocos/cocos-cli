'use strict';

import { copy, ensureDir, pathExists, readJSON } from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'path';

export const AGCONNECT_SERVICES_FILE = 'agconnect-services.json';

interface AgconnectServicesConfig {
    client?: {
        package_name?: string;
    };
}

export interface AgconnectConfigInfo {
    path: string;
    packageName: string;
}

function normalizeFilePath(filePath: string): string {
    if (filePath.startsWith('file:')) {
        return fileURLToPath(filePath);
    }
    return filePath;
}

export function getAgconnectConfigPath(projectPath: string): string {
    return join(projectPath, 'settings', AGCONNECT_SERVICES_FILE);
}

export async function readAgconnectConfig(configPath: string): Promise<AgconnectConfigInfo> {
    const path = normalizeFilePath(configPath);
    if (!path || !await pathExists(path)) {
        return { path: '', packageName: '' };
    }

    const config = await readJSON(path) as AgconnectServicesConfig;
    return {
        path,
        packageName: config.client?.package_name || '',
    };
}

export async function importAgconnectConfig(configPath: string, projectPath: string): Promise<AgconnectConfigInfo> {
    const source = normalizeFilePath(configPath);
    const info = await readAgconnectConfig(source);
    if (!info.path) {
        throw new Error('agconnect-services.json file does not exist.');
    }

    const target = getAgconnectConfigPath(projectPath);
    if (resolve(source) !== resolve(target)) {
        await ensureDir(join(projectPath, 'settings'));
        await copy(source, target, { overwrite: true });
    }
    return readAgconnectConfig(target);
}
