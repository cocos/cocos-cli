import { IBuildTaskOption, IBuildSceneItem } from './public';

// 导出的构建配置
export interface IExportBuildOptions extends IBuildTaskOption {
    __version__: string;
}

export interface IInternalBuildSceneItem extends IBuildSceneItem {
    // bundle url
    bundle: string;
    missing?: boolean;
}
