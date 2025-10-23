
/**
 * 配置范围
 */
export type ConfigurationScope = 'default' | 'project';

export const MessageType = {
    Save: 'configuration:save',
    Registry: 'configuration:registry',
    UnRegistry: 'configuration:unregistry',
} as const;

/**
 * 配置的格式
 */
export interface IConfiguration {

    /**
     * 其他配置
     */
    [key: string]: any;
}
