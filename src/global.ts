/**
 * 一些全局路径配置记录
 */

import { join } from "path";

export const GlobalPaths = {
    staticDir: join(__dirname, '../static'),
    workspace: join(__dirname, '..'),
    // 这里存放编译后的引擎代码
    engine: join(__dirname, '..', 'bin', 'engine'),
};

/**
 * CLI 的任务模式
 */
type CLITaskMode = 'hold' | 'simple';

interface IGlobalConfig {
    mode: CLITaskMode;
}

export const GlobalConfig: IGlobalConfig = {
    mode: 'hold',
}