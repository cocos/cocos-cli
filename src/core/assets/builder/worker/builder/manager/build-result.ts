import { join } from 'path';
import { buildAssetLibrary } from './asset-library';
import * as BundleUtils from '../asset-handler/bundle/utils';
import EventEmitter from 'events';
import { getBuildPath } from '../utils';
import { IBuildPaths, ISettings, IBuildTaskOption, IBuildResult, IRawAssetPathInfo, IAssetPathInfo, IImportAssetPathInfo } from '../../../@types';
import { ICompressImageResult, ImportMapWithImports, IBuilder, IBuildSeparateEngineResult } from '../../../@types/protected';
import { transI18n } from '../../../share/utils';
import { BuildGlobalInfo } from '../../../share/builder-config';

class Paths implements IBuildPaths {
    dir: string;
    readonly output: string;
    cache: Record<string, string> = {};
    compileConfig: string;

    effectBin?: string = '';
    engineMeta = '';

    hashedMap: Record<string, string> = {};

    plugins: Record<string, string> = {};
    constructor(dir: string) {
        this.dir = dir || '';
        this.output = this.dir;
        this.compileConfig = join(dir, BuildGlobalInfo.buildOptionsFileName);
    }

    get settings() {
        return this.cache.settings || join(this.dir, 'src', 'settings.json');
    }

    set settings(val: string) {
        this.cache.settings = val;
    }

    get subpackages() {
        return this.cache.subpackages || join(this.dir, BuildGlobalInfo.SUBPACKAGES_HEADER);
    }

    set subpackages(val: string) {
        this.cache.subpackages = val;
    }

    get assets() {
        return this.cache.assets || join(this.dir, BuildGlobalInfo.ASSETS_HEADER);
    }

    set assets(val: string) {
        this.cache.assets = val;
    }

    get remote() {
        return this.cache.remote || join(this.dir, BuildGlobalInfo.REMOTE_HEADER);
    }

    set remote(val: string) {
        this.cache.remote = val;
    }

    get applicationJS() {
        return this.cache.applicationJS || join(this.dir, 'application.js');
    }

    set applicationJS(val: string) {
        this.cache.applicationJS = val;
    }

    get importMap() {
        return this.cache.importMap || join(this.dir, 'import-map.js');
    }

    set importMap(val: string) {
        this.cache.importMap = val;
    }

    get bundleScripts() {
        return this.cache.bundleScripts || join(this.dir, 'src', BuildGlobalInfo.BUNDLE_SCRIPTS_HEADER);
    }

    set bundleScripts(val: string) {
        this.cache.bundleScripts = val;
    }
}

// 构建过程处理的缓存对象
export class InternalBuildResult extends EventEmitter implements InternalBuildResult {
    public settings: ISettings = {
        CocosEngine: '0.0.0',
        engine: {
            debug: true,
            platform: 'web-desktop',
            customLayers: [],
            sortingLayers: [],
            macros: {},
            builtinAssets: [],
        },
        animation: {
            customJointTextureLayouts: [],
        },
        assets: {
            server: '',
            remoteBundles: [],
            subpackages: [],
            preloadBundles: [],
            bundleVers: {},
            preloadAssets: [],
            projectBundles: [],
        },
        plugins: {
            jsList: [],
        },
        scripting: {},
        launch: {
            launchScene: '',
        },
        screen: {
            exactFitScreen: true,
            designResolution: {
                width: 960,
                height: 640,
                policy: 0,
            },
        },
        rendering: {
            renderPipeline: '',
        },
    };

    // 脚本资源包分组（子包/分包）
    public scriptPackages: string[] = [];

    // 插件版本
    public pluginVers: Record<string, string> = {};

    // 纹理压缩结果存储
    public compressImageResult: ICompressImageResult = {};

    /**
     * @param name
     * @param options
     * 导入映射
     */
    public importMap: ImportMapWithImports = { imports: {} };

    public rawOptions: IBuildTaskOption;

    public paths: IBuildPaths;

    public compileOptions: any = null; // 允许自定义编译选项，如果未指定将会使用构建 options 存储

    private __task: IBuilder;

    public pluginScripts: Array<{
        uuid: string;
        url: string;
        file: string;
    }> = [];

    public separateEngineResult?: IBuildSeparateEngineResult;

    public get dest() {
        // TODO 兼容 adsense 插件从外部插件转为内部插件，兼容至 3.9
        return this.paths.dir;
    }

    constructor(task: IBuilder, preview: boolean) {
        super();
        this.rawOptions = JSON.parse(JSON.stringify(task.options));
        // 虚拟路径
        let dest = join(BuildGlobalInfo.projectRoot, 'build', 'preview');
        if (!preview) {
            dest = getBuildPath(task.options);
        }
        this.paths = new Paths(dest);
        this.__task = task;
    }

}

export class BuildResult implements IBuildResult {
    private readonly __task: IBuilder;

    public settings?: ISettings;
    public dest: string;

    public get paths() {
        return this.__task.result.paths;
    }

    constructor(task: IBuilder) {
        this.__task = task;
        this.dest = getBuildPath(task.options);
        this.settings = task.result.settings;
    }

    /**
     * 指定的 uuid 资源是否包含在构建资源中
     */
    public containsAsset(uuid: string): boolean {
        return !!this.__task.bundleManager.bundles.find((bundle) => bundle.containsAsset(uuid));
    }

    /**
     * 获取指定 uuid 原始资源的存放路径（不包括序列化 json）
     * 自动图集的小图 uuid 和自动图集的 uuid 都将会查询到合图大图的生成路径
     * 实际返回多个路径的情况：查询 uuid 为自动图集资源，且对应图集生成多张大图，纹理压缩会有多个图片格式路径
     */
    public getRawAssetPaths(uuid: string): IRawAssetPathInfo[] {
        const assetInfo = buildAssetLibrary.getAsset(uuid);
        if (!assetInfo) {
            return [];
        }
        const bundles = this.__task.bundleManager.bundles.filter((bundle) => bundle.containsAsset(uuid, true));
        if (!bundles.length) {
            return [];
        }
        return bundles.flatMap((bundle) => {
            const res: IRawAssetPathInfo = {
                bundleName: bundle.name,
                raw: [],
            };
            if (bundle.getRedirect(uuid)) {
                res.redirect = bundle.getRedirect(uuid);
            } else {
                res.raw = BundleUtils.getRawAssetPaths(uuid, bundle);
            }
            if (!res.raw.length && !res.redirect) {
                return [];
            }
            return res;
        });
    }

    /**
     * 获取指定 uuid 资源的路径相关信息
     * @return Array<{raw?: string | string[]; import?: string; groupIndex?: number;}>
     * @return.raw: 该资源源文件的实际存储位置，存在多个为数组，不存在则为空
     * @return.import: 该资源序列化数据的实际存储位置，不存在为空，可能是 .bin 或者 .json 格式
     * @return.groupIndex: 若该资源的序列化数据在某个分组内，这里标识在分组内的 index，不存在为空
     */
    public getAssetPathInfo(uuid: string): IAssetPathInfo[] {
        const bundles = this.__task.bundleManager.bundles.filter((bundle) => bundle.containsAsset(uuid, true));
        if (!bundles.length) {
            return [];
        }
        return bundles.flatMap((bundle) => {
            const result: IAssetPathInfo = {
                bundleName: bundle.name,
            };
            if (bundle.getRedirect(uuid)) {
                result.redirect = bundle.getRedirect(uuid);
            } else {
                Object.assign(result, BundleUtils.getAssetPathInfo(uuid, bundle));
            }
            if (!result.raw && !result.redirect && !result.import) {
                return [];
            }
            return result;
        });
    }

    /**
     * @deprecated please use getImportAssetPaths instead
     * @param uuid 
     */
    public getJsonPathInfo(uuid: string): IImportAssetPathInfo[] {
        console.warn(transI18n('builder.warn.deprecatedTip', {
            oldName: 'result.getJsonPathInfo',
            newName: 'result.getImportAssetPaths',
        }));
        return this.getImportAssetPaths(uuid);
    }

    /**
     * 指定 uuid 资源的序列化信息在构建后的信息
     * @param uuid
     */
    public getImportAssetPaths(uuid: string): IImportAssetPathInfo[] {
        const bundles = this.__task.bundleManager.bundles.filter((bundle) => bundle.containsAsset(uuid));
        if (!bundles.length) {
            return [];
        }
        return bundles.flatMap((bundle) => {
            const result: IImportAssetPathInfo = {
                bundleName: bundle.name,
            };
            if (bundle.getRedirect(uuid)) {
                result.redirect = bundle.getRedirect(uuid);
            } else {
                const info = BundleUtils.getImportPathInfo(uuid, bundle);
                if (!info) {
                    return [];
                }
                Object.assign(result, info);
            }
            return result;
        });
    }

}