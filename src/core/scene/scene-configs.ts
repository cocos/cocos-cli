import { configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';

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
    };

    private configInstance!: IBaseConfiguration;

    async init() {
        this.configInstance = await configurationRegistry.register('scene', {
            defaults: this.defaultConfig,
        });
    }

    public get<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        return this.configInstance.get(path, scope);
    }

    public set(path: string, value: any, scope?: ConfigurationScope) {
        return this.configInstance.set(path, value, scope);
    }
}

export const sceneConfigInstance = new SceneConfig();
