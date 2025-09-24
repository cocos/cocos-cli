import { ApiBase } from "../base/api-base";

export class ProjectApi extends ApiBase {
    async init(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    constructor() {
        super();
    }
    async open(projectPath: string) {

    }
    async close() {

    }
}