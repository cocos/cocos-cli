import type { IInternalBuildPluginConfig, IPlatformBuildPluginConfig } from './@types/protected';

/** Already prepared by the embedding host or the standalone CLI discovery adapter. */
export type BuildRegistration = {
    extensionId: string;
    root: string;
    translations?: Record<string, Record<string, unknown>>;
} & (
    | { kind: 'platform'; platform: string; config: IPlatformBuildPluginConfig; hooks?: string }
    | { kind: 'plugin'; platform: string; config: IInternalBuildPluginConfig; hooks?: string }
    | { kind: 'plugin'; platform: string; config?: IInternalBuildPluginConfig; hooks: string }
);

/** External discovery initializes services without discovering or registering any plugins. */
export interface BuildInitializationOptions {
    discovery: 'external';
}
