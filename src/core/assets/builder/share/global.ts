import { join } from 'path';

let projectRoot = '';
export function init(root: string) {
    BuildGlobalInfo.projectRoot = root;
    projectRoot = root;
}

export const BuildGlobalInfo = {
    // 一些常量
    LIBRARY_NAME: 'library',
    IMPORT_HEADER: 'import',
    RESOURCES: 'resources',
    SUBPACKAGES_HEADER: 'subpackages',
    ASSETS_HEADER: 'assets',
    REMOTE_HEADER: 'remote',
    NATIVE_HEADER: 'native',
    BUNDLE_SCRIPTS_HEADER: 'bundle-scripts',
    SCRIPT_NAME: 'index.js',
    CONFIG_NAME: 'config.json',
    BUNDLE_ZIP_NAME: 'res.zip',
    projectRoot: '',
    projectName: 'projectName',

    platforms: [],

    get buildTemplateDir() {
        return join(projectRoot, 'build-templates')
    },
    // 缓存目录
    get projectTempDir() {
        return join(projectRoot, 'temp', 'builder');
    },
    globalTempDir: join('', 'builder'),
    debugMode: false,
    init: false,
    isCommand: false,

    buildOptionsFileName: 'cocos.compile.config.json',
};