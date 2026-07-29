import type { IPreviewSettingsResult } from '../builder/@types/private';

/**
 * 动态预览的 settings 缓存。
 *
 * `getPreviewSettings()` 本身是无状态函数，每次调用都会重新计算 settings / bundleConfigs。
 * 这里按 `startScene` 维度缓存结果，避免每个 HTTP 请求都重新计算；脚本/资源变化时由
 * live-reload 调 `invalidatePreviewSettings()` 清空缓存，下次请求重新生成。
 */
const cache = new Map<string, IPreviewSettingsResult>();

/**
 * 预览尚未就绪时抛出。路由据此返回可重试的 503，而不是生成缺 builtinAssets 的坏 settings 或裸 500。
 *
 * 「就绪」不能只看 assetDBManager.ready：该标志在 asset-db.start() 里被置位（asset-db.ts:139）
 * 后才 step() 继续导入，内置资源库 / 内置 bundle（builtinAssets 的来源，见 builder
 * setting-task/asset.ts:52 的 bundleMap[INTERNAL]._rootAssets）可能尚未完全就绪。此时
 * getPreviewSettings 要么抛错（bundleMap[INTERNAL] 缺失）→ 裸 500，要么产出 builtinAssets 为空
 * 的坏 settings → 运行时 "PhysicsSystem initDefaultMaterial Failed to load builtinMaterial" /
 * "Graphics recompileShaders of null"。因此这里以**内容校验**为准：生成失败或 builtinAssets 为空
 * 都视为未就绪，抛本错误（映射 503）且**不缓存**。
 *
 * 自愈机制（不依赖客户端手动刷新）：预览页在加载 settings/引擎之前就注册了 socket
 * `browser:reload` 监听（见 static/web/game.ejs）。未就绪时本次请求快速失败 503、boot 失败；
 * live-reload 侧监听资源事件，待 settings 首次真正可用（校验通过）时广播 browser:reload，页面
 * 整页刷新完成自愈。
 */
export class PreviewNotReadyError extends Error {
    constructor(message = 'Preview asset database is not ready yet.') {
        super(message);
        this.name = 'PreviewNotReadyError';
    }
}

/**
 * 获取（带缓存的）预览 settings。
 * @param startScene 启动场景的 uuid 或 db:// url，留空表示使用项目默认启动场景
 */
export async function getCachedPreviewSettings(startScene = ''): Promise<IPreviewSettingsResult> {
    const cached = cache.get(startScene);
    if (cached) {
        return cached;
    }
    // 第一道门禁：asset-db 连 ready 标志都没置位，必然未就绪，直接快速失败（省去无谓的生成尝试）。
    const { assetDBManager } = await import('../assets');
    if (!assetDBManager.ready) {
        throw new PreviewNotReadyError();
    }
    const result = await generatePreviewSettings(startScene);
    cache.set(startScene, result);
    return result;
}

/**
 * 生成并**校验**预览 settings。未就绪（生成抛错或 builtinAssets 为空）时抛 PreviewNotReadyError。
 * 抽出为独立函数，供 getCachedPreviewSettings 与 live-reload 的就绪探测复用；不写缓存。
 */
async function generatePreviewSettings(startScene: string): Promise<IPreviewSettingsResult> {
    const { assetManager } = await import('../assets');
    let result: IPreviewSettingsResult;
    try {
        const { getPreviewSettings, queryDefaultBuildConfigByPlatform } = await import('../builder');
        const { fillIncludeModulesFromProjectConfig } = await import('../builder/share/common-options-validator');
        const tmp = await queryDefaultBuildConfigByPlatform('web-desktop');
        const options = JSON.parse(JSON.stringify(tmp));
        // 与正式构建（builder createBuildTask）保持一致：从 cocos.config.json 补全 includeModules。
        // 预览路径原本不补全，options.includeModules 为空/默认时，内置资源包会漏掉当前模块（尤其是所选
        // 物理后端 physics-cannon/ammo/physx/builtin）的 dependentAssets，比如内置物理材质
        // default-physics-material (ba21476f)。运行时 PhysicsSystem.initDefaultMaterial() 便会
        // builtinResMgr.get 到 null，报 "Failed to load builtinMaterial"(errorID 9642)。
        // 同时这也让浏览器预览真正按项目配置的物理后端运行（切后端后能生效）。
        await fillIncludeModulesFromProjectConfig(options as any);
        // 解析有效启动场景：显式入参 > 构建配置（扁平或 packages 嵌套）> 项目首个场景。
        // 预览模式下 builder 不会校验/补全 startScene（见 setting-task/asset.ts），
        // 留空或指向已删除的场景都会导致前端请求 /scene/<uuid>.json 404。
        // 因此每个候选都要校验在 asset-db 中真实存在，否则继续回退。
        const candidates = [
            startScene,
            (options as any).startScene,
            (options as any).packages?.['web-desktop']?.startScene,
        ];
        let effectiveScene = '';
        for (const candidate of candidates) {
            if (candidate && assetManager.queryAssetInfo(candidate)) {
                effectiveScene = candidate;
                break;
            }
        }
        if (!effectiveScene) {
            effectiveScene = await resolveDefaultStartScene();
        }
        (options as any).startScene = effectiveScene;
        // 预览模式下注册项目中的全部场景，使运行时 cc.director.loadScene(name)/(uuid) 可加载任意场景，
        // 对齐编辑器预览行为。构建配置里的 scenes 默认只含构建时勾选的子集，会导致脚本里按名
        // loadScene 其它场景时报 "not in the build settings before playing"。
        const allScenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' }) || [];
        (options as any).scenes = allScenes.map((scene) => ({ url: scene.url, uuid: scene.uuid }));
        result = await getPreviewSettings(options);
    } catch (err) {
        // asset-db.ready 置位后、内置资源库/内置 bundle 尚未完全导入时，getPreviewSettings 会因
        // bundleMap[INTERNAL] 缺失等抛错。这属于「尚未就绪」，转成可重试错误（503）而非裸 500，
        // 且不缓存，交由 live-reload 在真正就绪后推送 browser:reload 自愈。
        throw new PreviewNotReadyError(
            'Preview settings generation failed (likely asset db not fully ready): ' + ((err as Error)?.message || String(err)),
        );
    }

    // 内容校验：builtinAssets 为空说明内置资源库/内置 bundle 尚未就绪。此时若放行，运行时会报
    // builtinMaterial 加载失败 / graphics recompileShaders null。视为未就绪，抛可重试错误、不缓存。
    const builtinAssets = (result as any)?.settings?.engine?.builtinAssets;
    if (!Array.isArray(builtinAssets) || builtinAssets.length === 0) {
        throw new PreviewNotReadyError('Preview settings has empty builtinAssets (asset db not fully ready).');
    }

    // 动态预览「只托管不构建」，但 getPreviewSettings 给出的 rendering.effectSettingsPath 默认指向
    // 构建产物 'src/effect.bin'（见 setting-task/utils/project-options.ts）。该文件在预览下不存在，
    // 浏览器请求 GET /src/effect.bin 会 404，引擎再把 404 页面当二进制解析，报
    // "RangeError: Offset is outside the bounds of the DataView"。
    // 自定义渲染管线时改指向动态 effect-settings 路由，与场景编辑器（engine/index.ts）一致，
    // 由服务端从 temp/asset-db/effect/effect.bin 提供。
    const rendering: any = (result as any)?.settings?.rendering;
    if (rendering && rendering.effectSettingsPath) {
        rendering.effectSettingsPath = '/scripting/engine/effect-settings';
    }

    return result;
}

/**
 * 探测预览 settings 是否已可用（校验通过并已写入缓存）。供 live-reload 在资源事件后判定「首次就绪」。
 * 返回 true 表示可用（缓存已预热）；未就绪返回 false；其它非就绪类异常向上抛出。
 */
export async function isPreviewSettingsReady(startScene = ''): Promise<boolean> {
    try {
        await getCachedPreviewSettings(startScene);
        return true;
    } catch (err) {
        if (err instanceof PreviewNotReadyError) {
            return false;
        }
        throw err;
    }
}

/**
 * 项目未配置启动场景（或配置已失效）时，回退到项目中的第一个场景资源。
 */
async function resolveDefaultStartScene(): Promise<string> {
    try {
        const { assetManager } = await import('../assets');
        const scenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' });
        if (scenes && scenes.length) {
            return scenes[0].uuid;
        }
        console.warn('[Preview Server] No scene asset found in project; launch scene will be empty.');
    } catch (err) {
        console.warn('[Preview Server] Failed to resolve default start scene:', err);
    }
    return '';
}

/**
 * 清空预览 settings 缓存。脚本重编译或资源变化后调用。
 */
export function invalidatePreviewSettings(): void {
    cache.clear();
}
