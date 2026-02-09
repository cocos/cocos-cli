import utils from '../../core/base/utils';

export class Base {
    static async init(projectPath: string): Promise<void> {
        utils.Path.register('project', {
            label: '项目',
            path: projectPath,
        });
    }
}
