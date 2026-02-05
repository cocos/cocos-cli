import utils from '../../core/base/utils';

export class BaseLib {
    static async init(projectPath: string): Promise<void> {
        utils.Path.register('project', {
            label: '项目',
            path: projectPath,
        });
    }
}
