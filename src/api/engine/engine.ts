import { ApiBase } from '../base/api-base';

export class EngineApi extends ApiBase {

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        super();
    }

    async init(): Promise<void> {
        const { initEngine } = await import('../../core/engine');
        await initEngine(this.enginePath, this.projectPath);
        console.log('initEngine success');
    }
}