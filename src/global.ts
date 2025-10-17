/**
 * 一些全局路径配置记录
 */

import { join } from 'path';

export const GlobalPaths: Record<string, string> = {
    staticDir: join(__dirname, '../static'),
    workspace: join(__dirname, '..'),
    enginePath: require(join(__dirname, '..', '.user.json')).engine,
};

// /**
//  * CLI 的任务模式
//  */
// type CLITaskMode = 'hold' | 'simple';

// interface IGlobalConfig {
//     mode: CLITaskMode;
// }

// export const GlobalConfig: IGlobalConfig = {
//     mode: 'hold',
// }