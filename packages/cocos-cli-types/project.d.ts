export declare function close_2(): Promise<void>;
export { close_2 as close }

export declare function get(): Promise<Project>;

export declare function getInfo(): Promise<ProjectInfo>;

export declare function init(projectPath: string): Promise<void>;

export declare interface IProject {
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
    get type(): '2d' | '3d';
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

export declare function open_2(projectPath: string): Promise<void>;
export { open_2 as open }

export declare class Project implements IProject {
    /**
     * The version of the Project
     */
    static readonly version = "4.0.0";
    private _projectPath;
    private _type;
    private _pkgPath;
    private _tmpDir;
    private _libraryDir;
    private _info;
    get path(): string;
    get type(): '2d' | '3d';
    static getPackageJsonPath(projectPath: string): string;
    get pkgPath(): string;
    get tmpDir(): string;
    get libraryDir(): string;
    static create(projectPath: string, type?: ProjectType): Promise<boolean>;
    getInfo(): ProjectInfo;
    getInfo(key: string): any;
    updateInfo<T>(keyOrValue: string | ProjectInfo, value?: T): Promise<boolean>;
    open(projectPath: string): Promise<boolean>;
    close(): Promise<boolean>;
    /**
     * Generates project information object
     *
     * @param {string} projectPath - The project directory path
     * @param {ProjectType} type - The project type (2d or 3d)
     * @returns {ProjectInfo} Generated project information
     */
    private static generateProjectInfo;
    /**
     * Validates if the project information is valid
     *
     * @param {ProjectInfo} info - The project information to validate
     * @returns {boolean} Returns true if the project info is valid, false otherwise
     */
    private isValid;
}

/**
 * Project creator information
 */
export declare interface ProjectCreatorInfo {
    /**
     * Version of the tool or engine used to create the project
     */
    version: string;

    /**
     * Dependencies of the project
     * - key: package name
     * - value: version number
     */
    dependencies?: {
        [name: string]: string,
    };

    /**
     * Registry configuration for package management
     */
    registry?: {
        /**
         * Remote repository configuration (e.g., npm, private registry)
         */
        remote?: {};
    };
}

/**
 * Project information
 */
export declare interface ProjectInfo {
    /**
     * Project name
     */
    name: string;

    /**
     * Project type ('2d' or '3d')
     */
    type: ProjectType;

    /**
     * Project version
     */
    version: string;

    /**
     * Unique identifier (UUID) of the project
     */
    uuid: string;

    /**
     * Information about the creator of the project
     */
    creator: ProjectCreatorInfo;

    /**
     * Other additional properties (flexible extension)
     */
    [key: string]: any;
}

/**
 * Project type
 * - '2d': 2D Project
 * - '3d': 3D Project
 */
export declare type ProjectType = '2d' | '3d';

export { }
