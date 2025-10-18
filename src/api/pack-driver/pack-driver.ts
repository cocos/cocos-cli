import { ApiBase } from '../base/api-base';
import { PackerDriver } from '../../core/scripting/packer-driver';
import { Engine } from '../../core/engine';

export class PackDriverApi extends ApiBase {
    constructor(
        private projectPath: string,
        private enginePath: string,
    ) {
        super();
    }

    async init() {
        const packDriver = await PackerDriver.create(this.projectPath, this.enginePath);
        await packDriver.init(Engine.getConfig().includeModules);
        await packDriver.resetDatabases();
        await packDriver.build();
    }

}