import { IBuildPanel, IInternalBuild } from './build-plugin';
import { IBuilder, IBundleManager } from './build-result';


// 定义 builder 进程内的全局变量
declare global {
    // 构建进程可用
    const Build: IInternalBuild;

    const __manager: {
        taskManager: any;
        currentStageTask: IStageTask;
        currentBuildTask: IBundleManager | IBuilder | null;
        currentTask: any;
        __taskId: string;
        workerMg: any;
        currentTaskName?: string;
    };

    // 渲染进程可用
    const BuildPanel: IBuildPanel;
}
