import { join } from 'path';
import { readJSON, writeJSON } from 'fs-extra';
import { defaultConfigMap } from '../configs';

export interface IProfile {
    /**
     * init profile
     * @param projectPath
     */
    init(projectPath: string): Promise<void>;

    /**
     * get project configs
     * @param name
     * @param key
     */
    getProject<T>(name: string, key?: string): Promise<T | null>;

    /**
     * set project config
     * @param name
     * @param key
     * @param value
     */
    setProject<T>(name: string, key: string, value: T): Promise<boolean>;
}

export class Profile implements IProfile {
    private _settingsPath: string = '';

    private _getByDotPath(source: any, dotPath: string): any {
        const keys = dotPath.split('.');
        let current = source;
        for (const k of keys) {
            if (current === undefined || current === null) {
                return null;
            }
            current = current[k];
        }
        return current ?? null;
    }

    public async init(projectPath: string): Promise<void> {
        this._settingsPath = join(projectPath, 'settings', 'v2', 'packages');
    }

    public async getProject<T>(name: string, key?: string): Promise<T | null> {
        try {
            if (!this._settingsPath) return null;

            const pkgPath = join(this._settingsPath, `${name}.json`);
            let json;
            try {
                json = await readJSON(pkgPath);
            } catch (e) {
                // File does not exist or read failed, use default configuration
                json = defaultConfigMap[name];
            }
            
            if (!json) return null;

            if (typeof key !== 'string') {
                return json as T;
            }

            const value = this._getByDotPath(json, key);
            if (value !== null && value !== undefined) {
                return value as T;
            }

            // Not configured in the project, try to fall back on the default configuration
            const def = defaultConfigMap[name];
            if (def) {
                const defVal = this._getByDotPath(def, key);
                if (defVal !== null && defVal !== undefined) {
                    return defVal as T;
                }
            }

            return null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    public async setProject<T>(name: string, key: string, value: T): Promise<boolean> {
        try {
            if (!this._settingsPath) return false;

            const pkgPath = join(this._settingsPath, `${name}.json`);
            const json = await readJSON(pkgPath);

            const keys = key.split('.');
            let current = json;

            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (current[k] === undefined || current[k] === null) {
                    current[k] = {};
                } else if (typeof current[k] !== 'object' || current[k] === null) {
                    throw new Error(`Cannot set property on non-object at path: ${keys.slice(0, i + 1).join('.')}`);
                }
                current = current[k];
            }

            const finalKey = keys[keys.length - 1];
            current[finalKey] = value;

            await writeJSON(pkgPath, json);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

export const profile = new Profile();
