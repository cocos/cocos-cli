import { spawn } from 'child_process';

/**
 * 异步执行命令
 * @param {string} cmd 命令
 * @param {string[]} args 参数数组
 * @param {object} [opts] 选项
 * @param {boolean} [opts.debug=true] 是否输出日志
 * @returns {Promise<void>}
 */
export async function runCommand(cmd, args = [], opts = {}) {
    const { debug = true, ...spawnOpts } = opts;

    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            stdio: 'inherit',
            ...spawnOpts
        });

        child.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Exit code ${code}`));
            }
        });
    });
}
