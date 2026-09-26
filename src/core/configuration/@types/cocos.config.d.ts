import { ImportConfiguration } from '../../assets/@types/config-export';
import { BuildConfiguration } from '../../builder/@types/config-export';
import { IEngineConfig } from '../../engine/@types/config';
import type { EngineSdkConfiguration } from '../../engine/selection';
import { ScriptProjectConfig } from '../../scripting/@types/config-export';

export interface SceneConfiguration {
    [key: string]: any;
}

// 用于 schema 校验规则导出
export interface COCOS_CONFIG {
    $schema?: string;
    version: string;
    builder: BuildConfiguration;
    import: ImportConfiguration;
    engine: IEngineConfig;
    /** Engine SDK path is relative to the project root; version and revision pin its exact identity. */
    engineSdk?: EngineSdkConfiguration;
    scene?: SceneConfiguration;
    script: ScriptProjectConfig;
}
