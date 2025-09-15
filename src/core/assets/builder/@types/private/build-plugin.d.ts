
import { ICustomBuildStageItem } from '../protected';
export interface IBuildStagesInfo {
    pkgNameOrder: string[];
    infos: Record<string, ICustomBuildStageItem>;
}
export interface IBuildAssetHandlerInfo {
    pkgNameOrder: string[];
    handles: {[pkgName: string]: Function};
}
