export interface ScriptProjectConfig {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    preserveSymlinks: boolean;

    importMap: string;
    previewBrowserslistConfigFile?: string;
}

export interface DBInfo {
    dbID: string;
    target: string
}
