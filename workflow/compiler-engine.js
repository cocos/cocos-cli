const { compileEngine } = require('../packages/engine-compiler/dist/index');
const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');

const userConfig = path.join(__dirname, '../.user.json');
if (!fse.existsSync(userConfig)) {
    // TODO 需要完善：如果没有 user.json 不是开发版本
    return;
}

(async () => {
    utils.logTitle('Compiler engine');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');
    const { engine } = require('../.user.json');

    if (fse.existsSync(path.join(engine, 'bin', '.cache', 'dev-cli')) && !isForce) {
        console.log('[Skip] compiler engine');
        return;
    }

    try {
        // tsc engine-compiler
        const sourceDir = path.join(__dirname, '../packages/engine-compiler');
        fse.removeSync(path.join(sourceDir, 'dist'));
        utils.runTscCommand(sourceDir)
        console.log('tsc', sourceDir);
        // 编译引擎
        await compileEngine(engine);

        // 编译后拷贝 .bind 文件夹
        const bindSourcePath = path.join(engine, 'bin');
        const engineTargetPath = path.join(__dirname, '..', 'bin', 'engine');

        fse.removeSync(engineTargetPath);
        console.log(`remove ${engineTargetPath}`);

        // TODO 后续需要统一整理具体要导出那些，因为缺了构建需要的引擎代码，例如 cmake 之类的
        // 拷贝需要的脚本
        utils.copyFilesFromDirsWithStructure([
            path.join(engine, 'native', 'external', 'emscripten'),
        ], engineTargetPath);

        if (fse.existsSync(bindSourcePath)) {
            console.log(`[Copy] .bin ${bindSourcePath} -> ${engineTargetPath}`);
            fse.copySync(bindSourcePath, path.join(engineTargetPath, 'bin'));
        } else {
            console.log(`[Skip] .bin folder not found, path: ${bindSourcePath}`);
        }
        // 写入 engine 版本号
        const enginePkgJSON = require(path.join(engine, 'package.json'))
        console.log(`write engine version: ${enginePkgJSON.version}`);
        fse.writeJSONSync(path.join(engineTargetPath, 'version.json'), {
            version: enginePkgJSON.version,
        }, { encoding: 'utf8', spaces: 4 });
    } catch (error) {
        throw error;
    }
})();
