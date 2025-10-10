import { existsSync, copy, remove, readJSON } from 'fs-extra';
import { basename, join } from 'path';
import i18n from '../../../../base/i18n';
import { Platform } from '../../../@types';
import { IBuildTemplate, BuildTemplateConfig } from '../../../@types/protected';
import utils from '../../../../base/utils';
import { BuildGlobalInfo } from '../../../share/builder-config';

export class BuildTemplate implements IBuildTemplate {
    _buildTemplateDirs: string[] = [];
    map: Record<string, {
        url: string;
        path: string;
    }> = {};
    _versionUser = '';
    config?: BuildTemplateConfig;
    get isEnable() {
        return !!this._buildTemplateDirs.length;
    }

    constructor(platform: Platform, taskName: string, config?: BuildTemplateConfig) {
        this.config = config;
        const { buildTemplateDir } = BuildGlobalInfo;
        // 初始化不同层级的构建模板地址，按照使用优先级从大到小排布
        const commonDir = join(buildTemplateDir, 'common');
        const platformDir = join(buildTemplateDir, this.config?.dirname || platform);
        const taskDir = join(buildTemplateDir, taskName);
        if (existsSync(taskDir)) {
            this._buildTemplateDirs.push(taskDir);
        }
        if (existsSync(platformDir)) {
            this._buildTemplateDirs.push(platformDir);
        }
        if (existsSync(commonDir)) {
            this._buildTemplateDirs.push(commonDir);
        }
        const internalTemplate: Record<string, string> = {
            'application': 'application.ejs',
        };
        Object.keys(internalTemplate).forEach((name) => {
            this.initUrl(internalTemplate[name], name);
        });

        // 初始化缓存版本号
        this._initVersion(platform);
    }

    query(name: string) {
        return this.map[name]?.path;
    }

    private async _initVersion(platform: string) {
        if (!this.config) {
            return;
        }
        try {
            // 默认构建模板需要有版本号
            const templateVersionJson = join(BuildGlobalInfo.buildTemplateDir, 'templates-version.json');
            // 用户模板版本号
            if (existsSync(templateVersionJson)) {
                this._versionUser = (await readJSON(templateVersionJson))[platform];
            }
            this._versionUser = this._versionUser || '1.0.0';
            // 用户构建模板版本小于默认构建模板版本，警告建议更新
            if (utils.Parse.compareVersion(this.config.version, this._versionUser)) {
                console.warn(i18n.t('builder.tips.templateVersionWarning', {
                    version: this._versionUser,
                    internalConfig: this.config.version,
                    platform,
                }));
            }
        } catch (error) {
            console.debug(error);
        }
    }

    findFile(relativeUrl: string): string {
        for (let i = 0; i < this._buildTemplateDirs.length; i++) {
            const dir = this._buildTemplateDirs[i];
            const path = join(dir, relativeUrl);
            if (existsSync(path)) {
                return path;
            }
        }
        return '';
    }

    initUrl(relativeUrl: string, name?: string) {
        const path = this.findFile(relativeUrl);
        name = name || basename(relativeUrl);
        if (path) {
            this.map[name] = {
                path,
                url: relativeUrl,
            };
            return path;
        }
    }

    async copyTo(dest: string) {
        // 按照优先级拷贝构建模板
        for (let index = (this._buildTemplateDirs.length - 1); index >= 0; index--) {
            const dir = this._buildTemplateDirs[index];
            await copy(dir, dest);
        }
        // 移除已经被处理的一些特殊的文件夹
        await Promise.all(Object.values(this.map).map((info) => {
            return remove(join(dest, info.url));
        }));
    }
}
