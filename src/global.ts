/**
 * 一些全局路径配置记录
 */

import { join } from 'path';

export const GlobalPaths = {
    staticDir: join(__dirname, '../static'),
    workspace: join(__dirname, '..'),
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