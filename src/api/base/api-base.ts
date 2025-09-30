
export abstract class ApiBase {
  abstract init(...args: any[]): Promise<void>;
}
