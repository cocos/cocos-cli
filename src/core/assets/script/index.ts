import { join } from "path";
import { CCEModuleMap } from "../../engine/@types/config";
import { SharedSettings } from "./interface";

class ScriptManager {

    /**
     * TODO 查询脚本依赖关系
     * @param path 
     * @returns 
     */
    async queryScriptUser(path: string): Promise<string[]> {

        return [];
    }

    /**
     * TODO SharedSettings
     * @returns 
     */
    querySharedSettings(): SharedSettings {
        let importMap: SharedSettings['importMap'];

        return {
            useDefineForClassFields: true,
            allowDeclareFields: true,
            loose: false,
            exportsConditions: [],
            guessCommonJsExports: false,
            importMap,
            preserveSymlinks: false,
        };

    }

    loadScript(scriptUuids: string[]) {

    }

    /**
     * TODO
     * @returns 
     */
    queryCCEModuleMap(): CCEModuleMap {
        // return PackerDriver.queryCCEModuleMap();
        const cceModuleMapLocation = join(__dirname, '../../cce-module.jsonc');
        // const cceModuleMap = JSON5.parse(readFileSync(cceModuleMapLocation, 'utf8')) as CCEModuleMap;
        // cceModuleMap.mapLocation = cceModuleMapLocation;
        return {} as CCEModuleMap;
    }

}

export default new ScriptManager();
