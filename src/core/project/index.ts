/**
 * 整合项目的一些配置信息以及创建功能等
 */
import { join } from 'path';
import { readJSON } from 'fs-extra';

export interface ProjectInfo {
    name: string;
    path: string;
    version: string;
    uuid: string;
    tmpDir: string;
    readonly lastVersion: string;
}


async function readProjectInfo(root: string): Promise<ProjectInfo> {
    const packageJSONPath = join(root, 'package.json');
    const packageJSON = await readJSON(packageJSONPath);
    return {
        name: packageJSON.name,
        path: root,
        version: packageJSON.version,
        uuid: packageJSON.uuid,
        tmpDir: join(root, 'temp'),
        lastVersion: packageJSON.lastVersion || '',
    };
}

class Project {
    info: ProjectInfo = {
        name: 'cocos-creator',
        path: '',
        version: '1.0.0',
        uuid: '',
        lastVersion: '',
        tmpDir: '',
    }

    /**
     * TODO 初始化配置
     */
    init() {

    }

}

export default new Project;