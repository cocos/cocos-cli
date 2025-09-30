import { ApiBase } from '../base/api-base';

export class ConfigurationApi extends ApiBase {

    constructor(
        private projectPath: string,
    ) {
        super();
    }

    async init(): Promise<void> {
        const { configurationManager } = await import('../../core/configuration');
        await configurationManager.initialize(this.projectPath);
    }
}
