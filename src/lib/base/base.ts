import utils from '../../core/base/utils';

export async function init(projectPath: string): Promise<void> {
    utils.Path.register('project', {
        label: '项目',
        path: projectPath,
    });
}

