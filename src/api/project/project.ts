import { ApiBase } from "../base/api-base";

export class ProjectApi extends ApiBase {
    async init(): Promise<void> {
        console.log('project init invoke');
    }
    constructor() {
        super();
    }
    async open(projectPath: string) {

    }
    async close() {

    }
}
