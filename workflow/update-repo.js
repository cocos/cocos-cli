const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 下载引擎工作流
 * 从 repo.json 配置文件中读取仓库信息并克隆到指定目录
 */
class UpdateRepo {
    constructor() {
        this.repoConfigPath = path.join(__dirname, '../repo.json');
    }

    /**
     * 读取仓库配置文件
     */
    readRepoConfig() {
        try {
            const configContent = fs.readFileSync(this.repoConfigPath, 'utf8');
            return JSON.parse(configContent);
        } catch (error) {
            console.error('读取 repo.json 配置文件失败:', error.message);
            process.exit(1);
        }
    }

    /**
     * 执行命令并输出日志
     */
    execCommand(command, cwd = process.cwd()) {
        console.log(`执行命令: ${command}`);
        console.log(`工作目录: ${cwd}`);
        try {
            const result = execSync(command, { 
                cwd, 
                stdio: 'inherit',
                encoding: 'utf8'
            });
            return result;
        } catch (error) {
            console.error(`命令执行失败: ${command}`);
            console.error(error.message);
            throw error;
        }
    }

    /**
     * 询问用户是否还原所有文件（3秒计时，默认还原）
     */
    async promptUserRestore(repoName) {
        const readline = require('readline');
        
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            console.log(`\n仓库 ${repoName} 已存在，是否还原所有文件并更新到最新代码？`);
            console.log('输入 n 跳过，[其他任意键或 3 秒后自动确认还原]...');

            const timeout = setTimeout(() => {
                rl.close();
                console.log('\n超时，默认还原所有文件');
                resolve(true);
            }, 3000);

            rl.question('', (answer) => {
                clearTimeout(timeout);
                rl.close();
                const shouldRestore = answer.toLowerCase() !== 'n';
                console.log(shouldRestore ? '确认还原所有文件' : '跳过还原');
                resolve(shouldRestore);
            });
        });
    }

    /**
     * 检查目录是否是 git 仓库
     */
    isGitRepository(dir) {
        const gitDir = path.join(dir, '.git');
        return fs.existsSync(gitDir);
    }

    /**
     * 更新已存在的仓库
     */
    async updateExistingRepository(key, config, targetDir) {
        const { repo, branch, tag } = config;
        
        console.log(`\n更新已存在的仓库: ${key}`);
        
        if (!this.isGitRepository(targetDir)) {
            console.log(`目录 ${targetDir} 不是 git 仓库，将删除并重新克隆`);
            fs.rmSync(targetDir, { recursive: true, force: true });
            return false; // 返回 false 表示需要重新克隆
        }

        try {
            // 询问用户是否还原
            const args = process.argv.slice(2);
            const isForce = args.includes('--force');
            isForce && console.log('强制还原仓库更新');
            const shouldRestore = isForce || await this.promptUserRestore(key);
            
            if (!shouldRestore) {
                console.log(`跳过仓库 ${key} 的更新`);
                return true;
            }

            // 还原有 git 记录的文件改动（不删除未跟踪的文件）
            console.log('还原有 git 记录的文件改动...');
            this.execCommand('git reset --hard HEAD', targetDir);

            // 获取远程更新
            console.log('获取远程更新...');
            this.execCommand('git fetch origin', targetDir);

            // 切换到指定分支或标签并更新
            if (branch) {
                console.log(`切换到分支并更新: ${branch}`);
                this.execCommand(`git checkout ${branch}`, targetDir);
                this.execCommand(`git reset --hard origin/${branch}`, targetDir);
            } else if (tag) {
                console.log(`切换到标签: ${tag}`);
                this.execCommand(`git checkout ${tag}`, targetDir);
            } else {
                // 如果没有指定分支或标签，更新当前分支
                console.log('更新当前分支到最新...');
                const currentBranch = this.execCommand('git rev-parse --abbrev-ref HEAD', targetDir).toString().trim();
                this.execCommand(`git reset --hard origin/${currentBranch}`, targetDir);
            }

            console.log(`仓库 ${key} 更新完成`);
            return true;
        } catch (error) {
            console.error(`更新仓库 ${key} 失败:`, error.message);
            return false; // 返回 false 表示需要重新克隆
        }
    }

    /**
     * 克隆单个仓库
     */
    async cloneRepository(key, config) {
        const { repo, dist, branch, tag } = config;
        
        if (!repo || !dist) {
            console.error(`仓库配置不完整: ${key}`);
            return false;
        }

        const targetDir = path.resolve(dist);
        
        console.log(`\n开始处理仓库: ${key}`);
        console.log(`仓库地址: ${repo}`);
        console.log(`目标目录: ${targetDir}`);

        // 如果目标目录已存在，尝试更新而不是删除
        if (fs.existsSync(targetDir)) {
            console.log(`目标目录已存在: ${targetDir}`);
            const updateSuccess = await this.updateExistingRepository(key, config, targetDir);
            
            if (updateSuccess) {
                return true;
            }
            // 如果更新失败，目录已被删除，继续执行克隆逻辑
        }

        // 确保父目录存在
        const parentDir = path.dirname(targetDir);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        try {
            // 克隆仓库
            console.log(`开始克隆仓库: ${key}`);
            const cloneCommand = `git clone ${repo} ${targetDir}`;
            this.execCommand(cloneCommand);

            // 切换到指定分支或标签
            if (branch) {
                console.log(`切换到分支: ${branch}`);
                this.execCommand(`git checkout ${branch}`, targetDir);
            } else if (tag) {
                console.log(`切换到标签: ${tag}`);
                this.execCommand(`git checkout ${tag}`, targetDir);
            }

            console.log(`仓库 ${key} 克隆完成`);
            return true;
        } catch (error) {
            console.error(`克隆仓库 ${key} 失败:`, error.message);
            return false;
        }
    }

    /**
     * 主要的下载工作流程
     */
    async run() {
        console.log('开始执行下载引擎工作流...');

        const repoConfig = this.readRepoConfig();
        const repositories = Object.keys(repoConfig);

        if (repositories.length === 0) {
            console.log('没有找到需要克隆的仓库配置');
            return;
        }

        console.log(`找到 ${repositories.length} 个仓库需要克隆`);

        let successCount = 0;

        // 克隆所有仓库
        for (const key of repositories) {
            const config = repoConfig[key];
            const success = await this.cloneRepository(key, config);
            
            if (success) {
                successCount++;
            }
        }

        console.log(`\n工作流执行完成！`);
        console.log(`成功克隆: ${successCount}/${repositories.length} 个仓库`);
        
        if (successCount < repositories.length) {
            process.exit(1);
        }
    }
}

// 如果直接运行此文件，执行下载工作流
if (require.main === module) {
    const downloader = new UpdateRepo();
    downloader.run().catch(error => {
        console.error('工作流执行失败:', error);
        process.exit(1);
    });
}

module.exports = UpdateRepo;
