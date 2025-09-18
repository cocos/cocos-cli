export abstract class ApiBase {
  protected projectPath: string;
  protected enginePath: string;
  constructor(projectPath: string, enginePath: string) {
    this.projectPath = projectPath;
    this.enginePath = enginePath;
  }
  abstract init(): Promise<void>;
}