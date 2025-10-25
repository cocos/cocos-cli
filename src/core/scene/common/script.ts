export interface IScriptService {
    investigatePackerDriver(): Promise<void>;
    loadScript(): Promise<void>;
    removeScript(): Promise<void>;
    scriptChange(): Promise<void>;
}
