import { BuildConfiguration, ImportConfiguration } from '../../assets/@types/config-export';
import { EngineConfig } from '../../engine/@types/config';

// 用于 schema 校验规则导出
export interface COCOS_CONFIG {
    builder: BuildConfiguration;
    import: ImportConfiguration;
    engine: EngineConfig;
}