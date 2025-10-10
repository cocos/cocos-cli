import { ApiBase } from '../base/api-base';
import { join } from 'path';

export class EngineApi extends ApiBase {

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        super();
    }

    async init(): Promise<void> {
        const { default: Engine } = await import('../../core/engine');
        await Engine.init(this.enginePath);
        console.log('initEngine', this.enginePath);
        await Engine.initEngine({
            importBase: join(this.projectPath, 'library'),
            nativeBase: join(this.projectPath, 'library'),
            writablePath: join(this.projectPath, 'temp'),
        });
        console.log('initEngine success');
    }
}