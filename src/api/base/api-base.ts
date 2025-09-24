export abstract class ApiBase {
 
  constructor() {

  }
  abstract init(): Promise<void>;
}