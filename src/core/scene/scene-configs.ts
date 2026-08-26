import { configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';
import { createSceneMetadataNodes } from './metadata';
import type { IReferenceImageConfig } from './common/reference-image';

export interface IOriginAxesConfig {
    x: boolean;
    y: boolean;
    z: boolean;
}

export interface ICameraConfig {
    color: number[];
    fov: number;
    far: number;
    near: number;
    wheelSpeed: number;
    wanderSpeed: number;
    enableAcceleration: boolean;
    aperture: number;
    shutter: number;
    iso: number;
    far2D?: number;
    near2D?: number;
    wheelSpeed2D?: number;
}

export interface IRectSnapConfig {
    enableSnapping: boolean;
    snapThreshold: number;
}

export interface IGizmoConfig {
    is2D: boolean;
    is3DIcon: boolean;
    iconSize: number;
    transformToolName: string;
    viewMode: 'view' | 'select';
    pivot: string;
    coordinate: string;
    toolsVisibility3d: boolean;
    gridVisible: boolean;
    gridColor: number[];
    originAxis2D: IOriginAxesConfig;
    originAxis3D: IOriginAxesConfig;
    snapConfigs?: {
        position: { x: number; y: number; z: number };
        rotation: number;
        scale: number;
        isPositionSnapEnabled: boolean;
        isRotationSnapEnabled: boolean;
        isScaleSnapEnabled: boolean;
    };
    rectSnapConfig?: IRectSnapConfig;
}

export interface ISceneViewConfig {
    sceneLightOn: boolean;
}

export interface ISceneConfig {
    /**
     * 是否循环
     */
    tick: boolean;
    /**
     * 编辑器相机配置，与 cocos-editor scene/package.json profile 一致
     */
    camera: ICameraConfig;
    /**
     * Gizmo 配置，与 cocos-editor gizmos-infos profile 一致
     */
    gizmo: IGizmoConfig;
    /**
     * SceneView 配置
     */
    sceneView: ISceneViewConfig;
    /**
     * 各节点上编辑器相机的视角信息（按节点 uuid 存储），运行期由 Camera 服务写入。
     * 提供空默认值以避免首次读取时配置层抛错。
     */
    'camera-infos'?: Record<string, unknown>;
    /**
     * 记录过相机视角信息的节点 uuid 列表，运行期由 Camera 服务写入。
     */
    'camera-uuids'?: string[];
    referenceImage?: IReferenceImageConfig;
}

class SceneConfig {
    private defaultConfig: ISceneConfig = {
        tick: false,
        camera: {
            color: [48, 48, 48, 255],
            fov: 45,
            far: 10000,
            near: 0.01,
            wheelSpeed: 0.01,
            wanderSpeed: 10,
            enableAcceleration: true,
            aperture: 19,
            shutter: 7,
            iso: 0,
        },
        gizmo: {
            is2D: false,
            is3DIcon: false,
            iconSize: 2,
            transformToolName: 'position',
            viewMode: 'select',
            pivot: 'pivot',
            coordinate: 'local',
            toolsVisibility3d: true,
            gridVisible: true,
            gridColor: [166, 166, 166, 255],
            originAxis2D: {
                x: true,
                y: true,
                z: false,
            },
            originAxis3D: {
                x: true,
                y: false,
                z: true,
            },
            rectSnapConfig: {
                enableSnapping: true,
                snapThreshold: 4,
            },
        },
        sceneView: {
            sceneLightOn: true,
        },
        // 运行期由 Camera 服务写入；提供空默认值，避免首次 get 时配置层抛错并被 RPC 中间件记为错误日志
        'camera-infos': {},
        'camera-uuids': [],
        referenceImage: {
            images: [],
            sceneBindings: {},
            desiredVisible: true,
        },
    };

    private configInstance!: IBaseConfiguration;

    // 个人/本机键：存 local(profiles/)，不进版本库
    private static readonly PERSONAL_KEYS = ['camera', 'gizmo', 'sceneView', 'camera-infos', 'camera-uuids', 'referenceImage'];

    async init() {
        this.configInstance = await configurationRegistry.register('scene', {
            defaults: this.defaultConfig,
            nodes: () => createSceneMetadataNodes(this.defaultConfig),
        });
        await this._migratePersonalKeysToLocal();
    }

    /**
     * 一次性迁移：把历史上写在 project(committed) 里的个人键搬到 local(profiles/)，并从 project 删除，
     * 避免个人配置继续被提交。仅在 local 尚无该键时迁移，避免覆盖已有 local 值。
     */
    private async _migratePersonalKeysToLocal(): Promise<void> {
        const projectAll = this.configInstance.getAll('project') || {};
        const localAll = this.configInstance.getAll('local') || {};
        for (const key of SceneConfig.PERSONAL_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(projectAll, key)) {
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(localAll, key)) {
                await this.configInstance.set(key, projectAll[key], 'local');
            }
            await this.configInstance.remove(key, 'project');
        }
    }

    private resolveSetScope(path: string, scope?: ConfigurationScope): ConfigurationScope | undefined {
        if (scope) {
            return scope;
        }
        return SceneConfig.PERSONAL_KEYS.some((key) => path === key || path.startsWith(`${key}.`))
            ? 'local'
            : undefined;
    }

    public get<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        return this.configInstance.get(path, scope);
    }

    public set(path: string, value: any, scope?: ConfigurationScope) {
        return this.configInstance.set(path, value, this.resolveSetScope(path, scope));
    }
}

export const sceneConfigInstance = new SceneConfig();
