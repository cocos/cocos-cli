import path from 'path';
import os from 'os';
import fse from 'fs-extra';
import { CocosConfigScope, VERSION } from './types';
import { newConsole } from '../../base/console';

/**
 * CocosCreator 旧配置加载器
 */
export class CocosConfigLoader {
    private initialized = false;
    private projectPath = '';
    private configMap: Map<string, any> = new Map();

    public initialize(projectPath: string): void {
        if (this.initialized) return;

        this.projectPath = projectPath;
        this.initialized = true;
    }

    /**
     * 根据 scope 获取路径
     * @param pkgName
     * @param scope
     * @private
     */
    private getPathByScope(pkgName: string, scope: CocosConfigScope): string {
        let dir = '';
        if (scope === 'project') {
            dir = path.join(this.projectPath, 'settings');
        } else if (scope === 'local') {
            dir = path.join(this.projectPath, 'profiles');
        } else {
            dir = path.join(os.homedir(), '.CocosCreator', 'profiles');
        }

        return path.join(dir, VERSION, 'packages', pkgName + '.json');
    }

    /**
     * 加载配置
     * @param scope 配置范围
     * @param pkgName 包名
     * @returns 配置对象
     */
    public async loadConfig(scope: CocosConfigScope, pkgName: string): Promise<any> {
        const configs = this.configMap.get(scope);
        if (configs && configs[pkgName]) {
            return configs[pkgName];
        }

        const pkgPath = this.getPathByScope(pkgName, scope);
        if (await fse.pathExists(pkgPath)) {
            try {
                const pkg = await fse.readJSON(pkgPath);
                const configs = this.configMap.get(scope) || {};
                configs[pkgName] = pkg;
                this.configMap.set(scope, configs);
                return pkg;
            } catch (error) {
                newConsole.warn(`[Migration] 加载 ${scope} 配置失败: ${pkgPath} - ${error}`);
            }
        }
        
        return null;
    }
}
