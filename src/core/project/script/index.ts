import { v4 } from 'node-uuid';
import { basename, join } from 'path';
import { existsSync, mkdir, readJSON } from 'fs-extra';
import { ProjectInfo, ProjectType } from '../@types/public';
import { safeOutputJSON } from '../utils';

export interface IProject {
    /**
     * Gets the project directory path
     *
     * @returns {string} The project directory path
     */
    get path(): string;

    /**
     * Gets the project type (2d or 3d)
     *
     * @returns {'2d' | '3d'} The project type
     */
    get type(): '2d' | '3d'

    /**
     * Gets the package.json file path
     *
     * @returns {string} The path to package.json file
     */
    get pkgPath(): string;

    /**
     * Gets the temp directory path
     *
     * @returns {string} The path to the temporary directory
     */
    get tmpDir(): string;

    /**
     * Gets the library directory path
     *
     * @returns {string} The path to the library directory
     */
    get libraryDir(): string;

    /**
     * Opens the project and loads project information
     *
     * @returns {Promise<boolean>} Returns true if the project was opened successfully, false otherwise
     */
    open(projectPath: string): Promise<boolean>;

    /**
     * Closes the project and saves current project information
     *
     * @returns {Promise<boolean>} Returns true if the project was closed successfully, false otherwise
     */
    close(): Promise<boolean>;

    /**
     * Gets the complete project information
     *
     * @returns {ProjectInfo} The complete project information object
     */
    getInfo(): ProjectInfo;

    /**
     * Gets specific project information by key path
     *
     * @param {string} key - The key path to access nested properties (e.g., 'creator.version')
     * @returns {any} The value at the specified key path, or null if not found
     */
    getInfo(key: string): any;

    /**
     * Gets project information with optional key path
     *
     * @param {string} [key] - Optional key path to access nested properties
     * @returns {ProjectInfo | any} Project information or specific value
     */
    getInfo(key?: string): ProjectInfo | any;

    /**
     * Updates specific project information by key path or complete info
     *
     * @param {string | ProjectInfo} keyOrValue - Either a key path string or complete ProjectInfo object
     * @param {ProjectInfo} [value] - The value to set when using key path (required if keyOrValue is string)
     * @returns {Promise<boolean>} Returns true if update was successful, false otherwise
     */
    updateInfo<T>(keyOrValue: string | ProjectInfo, value?: T): Promise<boolean>;
}

export class Project implements IProject {
    /**
     * The version of the Project
     */
    static readonly version = '4.0.0';

    private _projectPath: string = '';
    private _type: ProjectType = '3d';
    private _pkgPath: string | undefined;
    private _tmpDir: string | undefined;
    private _libraryDir: string | undefined;
    private _info: ProjectInfo = {
        name: 'unknow',
        type: '3d',
        version: 'unknow',
        uuid: 'unknow',
        creator: {
            version: 'unknow',
        }
    };

    get path(): string {
        return this._projectPath;
    }

    get type(): '2d' | '3d' {
        return this._type;
    }

    static getPackageJsonPath(projectPath: string): string {
        return join(projectPath, 'package.json');
    }

    get pkgPath(): string {
        if (!this._pkgPath) {
            this._pkgPath = Project.getPackageJsonPath(this._projectPath);
        }
        return this._pkgPath;
    }

    get tmpDir(): string {
        if (!this._tmpDir) {
            this._tmpDir = join(this._projectPath, 'tmp');
        }
        return this._tmpDir;
    }

    get libraryDir(): string {
        if (!this._libraryDir) {
            this._libraryDir = join(this._projectPath, 'library');
        }
        return this._libraryDir;
    }

    public static async create(projectPath: string, type: ProjectType = '3d'): Promise<boolean> {
        try {
            const packageJSONPath = Project.getPackageJsonPath(projectPath);
            if (existsSync(projectPath) || existsSync(packageJSONPath)) {
                throw new Error('Failed to create project, project exist');
            }
            await mkdir(projectPath, { recursive: true });
            const requiredDirs = [
                join(projectPath, 'temp'),
                join(projectPath, 'library')
            ].map(dir => !existsSync(dir) ? mkdir(dir, { recursive: true }) : Promise.resolve());

            await Promise.all(requiredDirs);
            await safeOutputJSON(packageJSONPath, Project.generateProjectInfo(projectPath, type));
            return true;
        } catch (error) {
            return false;
        }
    }

    public getInfo(): ProjectInfo;

    public getInfo(key: string): any;

    public getInfo(key?: string): ProjectInfo | any {
        if (typeof key !== 'string') {
            return this._info;
        }
        const keys = key.split('.');

        let current = this._info;
        for (const k of keys) {
            if (current === undefined || current === null) {
                return null;
            }
            current = current[k];
        }
        return current;
    }

    public async updateInfo<T>(keyOrValue: string | ProjectInfo, value?: T): Promise<boolean> {
        try {
            if (typeof keyOrValue === 'string') {
                const keys = keyOrValue.split('.');
                let current = this._info;

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
            } else {
                this._info = { ...this._info, ...keyOrValue };
            }

            await safeOutputJSON(this.pkgPath, this._info);
            return true;
        } catch (error) {
            return false;
        }
    }

    public async open(projectPath: string): Promise<boolean> {
        this._projectPath = projectPath;
        if (!existsSync(projectPath) || !existsSync(this.pkgPath)) {
            throw new Error(`Failed to open project ${projectPath} : package.json not found.`);
        } else {
            const info: ProjectInfo = await readJSON(this.pkgPath);
            if (!this.isValid(info)) {
                throw new Error(`Failed to open project ${projectPath}: package.json data error.`);
            }
            await this.updateInfo(info);
        }
        return true;
    }

    public async close(): Promise<boolean> {
        return await safeOutputJSON(this.pkgPath, this.getInfo());
    }

    /**
     * Generates project information object
     *
     * @param {string} projectPath - The project directory path
     * @param {ProjectType} type - The project type (2d or 3d)
     * @returns {ProjectInfo} Generated project information
     */
    private static generateProjectInfo(projectPath: string, type: ProjectType): ProjectInfo {
        return {
            name: basename(projectPath),
            type: type,
            version: Project.version,
            uuid: v4(),
            creator: {
                version: Project.version,
                dependencies: {}
            }
        };
    }

    /**
     * Validates if the project information is valid
     *
     * @param {ProjectInfo} info - The project information to validate
     * @returns {boolean} Returns true if the project info is valid, false otherwise
     */
    private isValid(info: ProjectInfo): boolean {
        return typeof info.type !== 'undefined' ||
            typeof info.version !== 'undefined' ||
            typeof info.creator !== 'undefined';
    }
}

export const project = new Project();
