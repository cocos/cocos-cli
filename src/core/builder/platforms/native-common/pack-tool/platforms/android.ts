import * as fs from 'fs-extra';
import * as ps from 'path';
import { cchelper } from '../utils';
import NativePackTool, { CocosParams } from '../base/default';

export interface IAndroidParam {
    packageName: string;
    apiLevel: number;
    appABIs: string[];
    sdkPath: string;
    ndkPath: string;
    javaHome?: string;
    javaPath?: string;
    [key: string]: any;
}

export default class AndroidPackTool extends NativePackTool {
    declare params: CocosParams<IAndroidParam>;

    async create() {
        await this.copyCommonTemplate();
        
        // 检查 CMakeLists.txt 是否存在，如果不存在，强制复制模板
        // 这通常发生在 native 目录存在但文件不完整的情况下
        const cmakePath = ps.join(this.paths.platformTemplateDirInPrj, 'CMakeLists.txt');
        if (!fs.existsSync(cmakePath)) {
            console.log(`CMakeLists.txt not found in ${cmakePath}, copying template...`);
            // Android 模板在 templates/android/template 目录下
            await fs.copy(ps.join(this.paths.platformTemplateDirInCocos, 'template'), this.paths.platformTemplateDirInPrj, { overwrite: true });
        }

        await this.copyPlatformTemplate();
        await this.generateCMakeConfig();
        await this.executeCocosTemplateTask();

        await this.encryptScripts();
        return true;
    }

    async generate() {
        const nativePrjDir = this.paths.nativePrjDir;
        const platformTemplateDir = this.paths.platformTemplateDirInPrj;
        const buildTemplateDir = ps.join(this.paths.nativeTemplateDirInCocos, 'android', 'build');

        // 1. 确保构建目录存在
        fs.ensureDirSync(nativePrjDir);

        // 2. 复制 Android 项目骨架 (gradlew 等)
        if (fs.existsSync(buildTemplateDir)) {
            await fs.copy(buildTemplateDir, nativePrjDir, { overwrite: true });
        }

        // 3. 复制用户代码 (native/engine/android) 到构建目录，覆盖骨架
        if (fs.existsSync(platformTemplateDir)) {
            // 先删除构建目录中的 res 目录，避免与用户代码中的 res 目录冲突
            const resDirInBuild = ps.join(nativePrjDir, 'res');
            if (fs.existsSync(resDirInBuild)) {
                await fs.remove(resDirInBuild);
                console.log(`[Android] Removed existing res directory in build folder to avoid conflicts`);
            }
            await fs.copy(platformTemplateDir, nativePrjDir, { overwrite: true });
        }

        // 3.1. 替换 settings.gradle 中的项目名
        // 因为复制文件可能会覆盖之前在 create() 阶段替换的内容，需要再次替换
        const settingsGradlePath = ps.join(nativePrjDir, 'settings.gradle');
        if (fs.existsSync(settingsGradlePath)) {
            const projectName = this.params.projectName;
            if (projectName !== 'CocosGame') {
                // 使用全局正则表达式替换所有出现的 CocosGame
                const content = await fs.readFile(settingsGradlePath, 'utf8');
                const newContent = content.replace(/CocosGame/g, projectName);
                await fs.writeFile(settingsGradlePath, newContent, 'utf8');
                console.log(`[Android] Replaced project name in settings.gradle: CocosGame -> ${projectName}`);
            }
        }

        // 4. 生成 local.properties
        const sdkPath = this.params.platformParams.sdkPath;
        const ndkPath = this.params.platformParams.ndkPath;
        let localProps = '';
        console.log(`[Android] Generating local.properties with SDK: ${sdkPath}, NDK: ${ndkPath}`);
        if (sdkPath) {
            // Windows 下路径分隔符可能需要处理
            localProps += `sdk.dir=${cchelper.fixPath(sdkPath)}\n`;
        }
        if (ndkPath) {
            localProps += `ndk.dir=${cchelper.fixPath(ndkPath)}\n`;
        }
        if (localProps) {
            const propsPath = ps.join(nativePrjDir, 'local.properties');
            // 如果文件已存在，先读取内容，合并属性
            if (fs.existsSync(propsPath)) {
                const existingProps = await fs.readFile(propsPath, 'utf8');
                // 简单的合并策略：如果新属性不存在于旧内容中，则追加
                // 更严谨的做法是解析 properties 文件
                if (!existingProps.includes('sdk.dir=') && sdkPath) {
                    await fs.appendFile(propsPath, `\nsdk.dir=${cchelper.fixPath(sdkPath)}`);
                }
                // 不要写入 ndk.dir，这会导致与 build.gradle 中的 android.ndkVersion 冲突
                // 如果 ndk.dir 与 android.ndkVersion 指定的版本不一致，构建会失败
                // 通过让 Gradle 根据 android.ndkVersion 自动查找 NDK 目录来解决此问题
                // if (!existingProps.includes('ndk.dir=') && ndkPath) {
                //     await fs.appendFile(propsPath, `\nndk.dir=${cchelper.fixPath(ndkPath)}`);
                // }
            } else {
                 // 仅写入 sdk.dir
                 await fs.writeFile(propsPath, `sdk.dir=${cchelper.fixPath(sdkPath)}\n`);
            }
            console.log(`[Android] local.properties updated/generated at: ${propsPath}`);
        } else {
             console.warn('[Android] local.properties skipped because sdkPath and ndkPath are empty');
        }

        // 5. 更新 gradle.properties 中的 COCOS_ENGINE_PATH
        const gradlePropsPath = ps.join(nativePrjDir, 'gradle.properties');
        if (fs.existsSync(gradlePropsPath)) {
            let gradleProps = await fs.readFile(gradlePropsPath, 'utf8');
            const enginePath = this.params.enginePath;
            let nativeEnginePath = this.params.nativeEnginePath;
            console.log(`[Android] Debug Params - enginePath: ${enginePath}, nativeEnginePath: ${nativeEnginePath}`);
            
            if (!nativeEnginePath && enginePath) {
                // 如果 nativeEnginePath 未定义，尝试从 enginePath 推断
                // 通常 native 目录在 enginePath/native
                const potentialNativePath = ps.join(enginePath, 'native');
                if (fs.existsSync(potentialNativePath)) {
                    nativeEnginePath = potentialNativePath;
                    console.log(`[Android] Inferred nativeEnginePath: ${nativeEnginePath}`);
                }
            } else if (!nativeEnginePath && !enginePath) {
                 // 最后的尝试：假设我们正在运行在 cocos-cli 项目中，且 packages/engine 存在
                 // 这是一个开发环境的 fallback
                 const cliEnginePath = ps.resolve(__dirname, '../../../../../../../../packages/engine');
                 if (fs.existsSync(cliEnginePath)) {
                     // nativeEnginePath = ps.join(cliEnginePath, 'native'); // 这似乎不对，cliEnginePath 已经是 packages/engine
                     // 实际上 engineInfo.typescript.path 应该指向这个目录
                     // 但我们这里只是为了获取 native 目录
                     // 无论如何，我们尝试构造一个路径
                     // 实际上，如果 enginePath 都没有，说明初始化流程有问题
                 }
            }

            if (nativeEnginePath || this.params.enginePath) {
                // settings.gradle: new File(COCOS_ENGINE_PATH,'cocos/platform/android/libcocos2dx')
                // 这里的路径结构表明 COCOS_ENGINE_PATH 应该指向 native 目录
                // 因为文件实际位于 packages/engine/native/cocos/platform/android/libcocos2dx
                
                // 优先使用 nativeEnginePath
                let targetEnginePath = nativeEnginePath;
                if (!targetEnginePath && this.params.enginePath) {
                    // 如果 nativeEnginePath 未定义，尝试从 enginePath/native 获取
                    targetEnginePath = ps.join(this.params.enginePath, 'native');
                }
                
                if (targetEnginePath) {
                    const fixedPath = cchelper.fixPath(targetEnginePath);
                    // 替换 COCOS_ENGINE_PATH= 为 COCOS_ENGINE_PATH=path
                    if (gradleProps.includes('COCOS_ENGINE_PATH=')) {
                        gradleProps = gradleProps.replace(/COCOS_ENGINE_PATH=(.*)/, `COCOS_ENGINE_PATH=${fixedPath}`);
                        await fs.writeFile(gradlePropsPath, gradleProps);
                        console.log(`[Android] Updated COCOS_ENGINE_PATH in gradle.properties to: ${fixedPath}`);
                    }
                }
            }

            // 6. 更新 RES_PATH
            // RES_PATH 应该是 build/android 目录
            const resPath = cchelper.fixPath(this.paths.buildDir);
            gradleProps = await fs.readFile(gradlePropsPath, 'utf8'); // re-read in case it was updated
            if (gradleProps.includes('RES_PATH=')) {
                 // 如果为空或者需要强制更新
                 gradleProps = gradleProps.replace(/RES_PATH=(.*)/, `RES_PATH=${resPath}`);
                 await fs.writeFile(gradlePropsPath, gradleProps);
                 console.log(`[Android] Updated RES_PATH in gradle.properties to: ${resPath}`);
            }

            // 7. 添加/更新签名相关配置
            gradleProps = await fs.readFile(gradlePropsPath, 'utf8'); // re-read in case it was updated
            
            // 计算 keystore 文件的绝对路径
            const { keystoreAlias, keystoreAliasPassword, keystorePassword, keystorePath } = this.params.platformParams;
            const fixedKeystorePath = cchelper.fixPath(keystorePath);
            
            // 更新或添加 RELEASE_STORE_FILE（处理注释行）
            if (gradleProps.match(/^#?\s*RELEASE_STORE_FILE=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*RELEASE_STORE_FILE=.*$/m, `RELEASE_STORE_FILE=${fixedKeystorePath}`);
            } else {
                gradleProps += `\nRELEASE_STORE_FILE=${fixedKeystorePath}`;
            }
            
            // 更新或添加 RELEASE_STORE_PASSWORD（处理注释行）
            if (gradleProps.match(/^#?\s*RELEASE_STORE_PASSWORD=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*RELEASE_STORE_PASSWORD=.*$/m, `RELEASE_STORE_PASSWORD=${keystorePassword}`);
            } else {
                gradleProps += `\nRELEASE_STORE_PASSWORD=${keystorePassword}`;
            }
            
            // 更新或添加 RELEASE_KEY_ALIAS（处理注释行）
            if (gradleProps.match(/^#?\s*RELEASE_KEY_ALIAS=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*RELEASE_KEY_ALIAS=.*$/m, `RELEASE_KEY_ALIAS=${keystoreAlias}`);
            } else {
                gradleProps += `\nRELEASE_KEY_ALIAS=${keystoreAlias}`;
            }
            
            // 更新或添加 RELEASE_KEY_PASSWORD（处理注释行）
            if (gradleProps.match(/^#?\s*RELEASE_KEY_PASSWORD=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*RELEASE_KEY_PASSWORD=.*$/m, `RELEASE_KEY_PASSWORD=${keystoreAliasPassword}`);
            } else {
                gradleProps += `\nRELEASE_KEY_PASSWORD=${keystoreAliasPassword}`;
            }
            
            // 8. 添加/更新 APPLICATION_ID（使用 packageName，处理注释行）
            const packageName = this.params.platformParams.packageName;
            if (packageName) {
                if (gradleProps.match(/^#?\s*APPLICATION_ID=/m)) {
                    gradleProps = gradleProps.replace(/^#?\s*APPLICATION_ID=.*$/m, `APPLICATION_ID=${packageName}`);
                } else {
                    gradleProps += `\nAPPLICATION_ID=${packageName}`;
                }
            }
            
            // 9. 添加/更新 PROP_NDK_PATH（处理注释行）
            if (ndkPath) {
                const fixedNdkPath = cchelper.fixPath(ndkPath);
                if (gradleProps.match(/^#?\s*PROP_NDK_PATH=/m)) {
                    gradleProps = gradleProps.replace(/^#?\s*PROP_NDK_PATH=.*$/m, `PROP_NDK_PATH=${fixedNdkPath}`);
                } else {
                    gradleProps += `\nPROP_NDK_PATH=${fixedNdkPath}`;
                }
            }
            
            // 10. 添加/更新 NATIVE_DIR（处理注释行）
            const nativeDir = cchelper.fixPath(this.paths.platformTemplateDirInPrj);
            if (gradleProps.match(/^#?\s*NATIVE_DIR=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*NATIVE_DIR=.*$/m, `NATIVE_DIR=${nativeDir}`);
            } else {
                gradleProps += `\nNATIVE_DIR=${nativeDir}`;
            }

            // 11. 设置 SDK 版本
            // 强制设置编译 SDK 版本为 34，以避免 android-36 (Preview) 的资源链接问题
            // 如果用户指定的 apiLevel 大于 34，则使用用户的
            const apiLevel = this.params.platformParams.apiLevel || 34;
            const compileSdkVersion = Math.max(apiLevel, 34);
            
            if (gradleProps.match(/^#?\s*PROP_COMPILE_SDK_VERSION=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_COMPILE_SDK_VERSION=.*$/m, `PROP_COMPILE_SDK_VERSION=${compileSdkVersion}`);
            } else {
                gradleProps += `\nPROP_COMPILE_SDK_VERSION=${compileSdkVersion}`;
            }
            
            if (gradleProps.match(/^#?\s*PROP_TARGET_SDK_VERSION=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_TARGET_SDK_VERSION=.*$/m, `PROP_TARGET_SDK_VERSION=${apiLevel}`);
            } else {
                gradleProps += `\nPROP_TARGET_SDK_VERSION=${apiLevel}`;
            }

            // 11. 添加 PROP_MIN_SDK_VERSION（如果不存在）
            if (!gradleProps.match(/^#?\s*PROP_MIN_SDK_VERSION=/m)) {
                gradleProps += `\nPROP_MIN_SDK_VERSION=21`;
            }

            // 12. 更新 PROP_IS_DEBUG（参考 packages/engine 的实现）
            const isDebug = this.params.debug ? 'true' : 'false';
            if (gradleProps.match(/^#?\s*PROP_IS_DEBUG=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_IS_DEBUG=.*$/m, `PROP_IS_DEBUG=${isDebug}`);
            } else {
                gradleProps += `\nPROP_IS_DEBUG=${isDebug}`;
            }

            // 13. 添加 PROP_APP_NAME
            if (gradleProps.match(/^#?\s*PROP_APP_NAME=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_APP_NAME=.*$/m, `PROP_APP_NAME=${this.params.projectName}`);
            } else {
                gradleProps += `\nPROP_APP_NAME=${this.params.projectName}`;
            }

            // 14. 更新 PROP_ENABLE_INSTANT_APP（如果存在）
            const androidInstant = (this.params.platformParams as any).androidInstant || false;
            if (gradleProps.match(/^#?\s*PROP_ENABLE_INSTANT_APP=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_ENABLE_INSTANT_APP=.*$/m, `PROP_ENABLE_INSTANT_APP=${androidInstant ? 'true' : 'false'}`);
            } else if (!gradleProps.match(/^PROP_ENABLE_INSTANT_APP=/m)) {
                gradleProps += `\nPROP_ENABLE_INSTANT_APP=${androidInstant ? 'true' : 'false'}`;
            }

            // 15. 更新 PROP_ENABLE_INPUTSDK（如果存在）
            const inputSDK = (this.params.platformParams as any).inputSDK || false;
            if (gradleProps.match(/^#?\s*PROP_ENABLE_INPUTSDK=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_ENABLE_INPUTSDK=.*$/m, `PROP_ENABLE_INPUTSDK=${inputSDK ? 'true' : 'false'}`);
            } else if (!gradleProps.match(/^PROP_ENABLE_INPUTSDK=/m)) {
                gradleProps += `\nPROP_ENABLE_INPUTSDK=${inputSDK ? 'true' : 'false'}`;
            }

            // 16. 更新 PROP_ENABLE_COMPRESS_SO（如果存在）
            const isSoFileCompressed = (this.params.platformParams as any).isSoFileCompressed || false;
            if (gradleProps.match(/^#?\s*PROP_ENABLE_COMPRESS_SO=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_ENABLE_COMPRESS_SO=.*$/m, `PROP_ENABLE_COMPRESS_SO=${isSoFileCompressed ? 'true' : 'false'}`);
            } else if (!gradleProps.match(/^PROP_ENABLE_COMPRESS_SO=/m)) {
                gradleProps += `\nPROP_ENABLE_COMPRESS_SO=${isSoFileCompressed ? 'true' : 'false'}`;
            }

            // 17. 更新 PROP_APP_ABI
            const appABIs = this.params.platformParams.appABIs && this.params.platformParams.appABIs.length > 0 
                ? this.params.platformParams.appABIs.join(':') 
                : 'armeabi-v7a';
            if (gradleProps.match(/^#?\s*PROP_APP_ABI=/m)) {
                gradleProps = gradleProps.replace(/^#?\s*PROP_APP_ABI=.*$/m, `PROP_APP_ABI=${appABIs}`);
            } else {
                // 使用全局替换，因为可能有注释行
                gradleProps = gradleProps.replace(/PROP_APP_ABI=.*/g, `PROP_APP_ABI=${appABIs}`);
                if (!gradleProps.includes('PROP_APP_ABI=')) {
                    gradleProps += `\nPROP_APP_ABI=${appABIs}`;
                }
            }

            // 18. 更新 PROP_NDK_VERSION（从 NDK 的 source.properties 读取）
            if (ndkPath) {
                const ndkPropertiesPath = ps.join(ndkPath, 'source.properties');
                if (fs.existsSync(ndkPropertiesPath)) {
                    try {
                        const ndkContent = fs.readFileSync(ndkPropertiesPath, 'utf-8');
                        const regexp = /Pkg\.Revision\s*=\s*(.*)/;
                        const match = ndkContent.match(regexp);
                        if (match && match[1]) {
                            const ndkVersion = match[1].trim();
                            if (gradleProps.match(/^#?\s*PROP_NDK_VERSION=/m)) {
                                gradleProps = gradleProps.replace(/^#?\s*PROP_NDK_VERSION=.*$/m, `PROP_NDK_VERSION=${ndkVersion}`);
                            } else if (!gradleProps.match(/^PROP_NDK_VERSION=/m)) {
                                gradleProps += `\nPROP_NDK_VERSION=${ndkVersion}`;
                            }
                        }
                    } catch (e) {
                        console.warn(`[Android] Failed to read NDK version from ${ndkPropertiesPath}:`, e);
                    }
                }
            }
            
            await fs.writeFile(gradlePropsPath, gradleProps);
            console.log(`[Android] Updated gradle.properties with keystore, applicationId, NDK path, NATIVE_DIR, SDK versions, PROP_IS_DEBUG and PROP_APP_NAME`);

            // 12. 修复 strings.xml (如果为空)
            // 某些情况下，构建目录下的 strings.xml 可能是空的，导致构建失败
            const stringsXmlPath = ps.join(nativePrjDir, 'res', 'values', 'strings.xml');
            if (fs.existsSync(stringsXmlPath)) {
                const content = await fs.readFile(stringsXmlPath, 'utf8');
                if (!content || content.trim() === '' || content.replace(/\s/g, '') === '<resources></resources>') {
                    const appName = this.params.projectName || 'CocosGame';
                    const newContent = `<resources>\n    <string name="app_name" translatable="false">${appName}</string>\n</resources>`;
                    await fs.writeFile(stringsXmlPath, newContent);
                    console.log(`[Android] Repaired empty strings.xml with app_name: ${appName}`);
                }
            }

            // 19. 清理 res 目录，只保留 values
            // 避免与用户代码中的资源重复 (Duplicate resources)
            const resDir = ps.join(nativePrjDir, 'res');
            if (fs.existsSync(resDir)) {
                const items = await fs.readdir(resDir);
                for (const item of items) {
                    if (item !== 'values') {
                        const itemPath = ps.join(resDir, item);
                        await fs.remove(itemPath);
                        console.log(`[Android] Removed duplicated resource directory: ${item}`);
                    }
                }
            }
        }
        
        return true;
    }

    /**
     * 将项目名称转换为 ASCII 格式（用于 Gradle 任务名）
     * 参考 packages/engine 的实现
     */
    protected projectNameASCII(): string {
        // 将项目名称转换为 ASCII，移除特殊字符
        return this.params.projectName.replace(/[^a-zA-Z0-9]/g, '');
    }

    async make() {
        const options = this.params.platformParams;
        const nativePrjDir = this.paths.nativePrjDir;

        // 设置 JAVA_HOME（如果提供）
        if (options.javaHome) {
            if (process.env.JAVA_HOME !== options.javaHome) {
                process.env.JAVA_HOME = options.javaHome;
                console.log(`[Android] Update JAVA_HOME to ${options.javaHome}`);
            }
            const sep = process.platform === 'win32' ? ';' : ':';
            const javaBinPath = ps.join(options.javaHome, 'bin');
            if (!process.env.PATH!.includes(javaBinPath)) {
                process.env.PATH = javaBinPath + sep + process.env.PATH;
                console.log(`[Android] Add JAVA_HOME/bin to PATH`);
            }
        }

        if (!fs.existsSync(nativePrjDir)) {
            throw new Error(`[Android] Project directory not found: ${nativePrjDir}`);
        }

        let gradlew = 'gradlew';
        if (process.platform === 'win32') {
            gradlew += '.bat';
        } else {
            gradlew = './' + gradlew;
            // 确保 gradlew 有执行权限
            await fs.chmod(ps.join(nativePrjDir, 'gradlew'), '755');
        }

        // 构建模式：Debug 或 Release
        const outputMode = this.params.debug ? 'Debug' : 'Release';
        // 使用项目名而不是 ASCII 版本，因为 settings.gradle 中已经替换为实际项目名
        const projectName = this.params.projectName;
        
        // 编译 Android APK
        const buildMode = `${projectName}:assemble${outputMode}`;
        
        // 保存当前工作目录
        const originDir = process.cwd();
        try {
            process.chdir(nativePrjDir);
            await cchelper.runCmd(gradlew, [buildMode], false, nativePrjDir);
        } catch (e) {
            throw e;
        } finally {
            // 恢复工作目录
            process.chdir(originDir);
        }

        // 编译 Android Instant App（如果启用）
        const androidInstant = (options as any).androidInstant || false;
        if (androidInstant) {
            const instantBuildMode = `instantapp:assemble${outputMode}`;
            try {
                process.chdir(nativePrjDir);
                await cchelper.runCmd(gradlew, [instantBuildMode], false, nativePrjDir);
            } catch (e) {
                console.warn(`[Android] Failed to build instant app:`, e);
            } finally {
                process.chdir(originDir);
            }
        }

        // 编译 Google App Bundle（如果启用）
        const appBundle = (options as any).appBundle || false;
        if (appBundle) {
            let bundleBuildMode: string;
            if (androidInstant) {
                bundleBuildMode = `bundle${outputMode}`;
            } else {
                bundleBuildMode = `${projectName}:bundle${outputMode}`;
            }
            try {
                process.chdir(nativePrjDir);
                await cchelper.runCmd(gradlew, [bundleBuildMode], false, nativePrjDir);
            } catch (e) {
                console.warn(`[Android] Failed to build app bundle:`, e);
            } finally {
                process.chdir(originDir);
            }
        }

        return await this.copyToDist();
    }

    /**
     * 复制构建产物到发布目录
     * 参考 packages/engine 的实现
     */
    async copyToDist(): Promise<boolean> {
        const options = this.params.platformParams;
        const suffix = this.params.debug ? 'debug' : 'release';
        const destDir = ps.join(this.paths.buildDir, 'publish', suffix);
        fs.ensureDirSync(destDir);

        // 复制 APK
        const apkPath = this.getApkPath();
        if (!fs.existsSync(apkPath)) {
            throw new Error(`[Android] APK not found at ${apkPath}`);
        }
        // 使用项目名而不是 ASCII 版本，与 settings.gradle 中的项目名保持一致
        const apkName = `${this.params.projectName}-${suffix}.apk`;
        fs.copyFileSync(apkPath, ps.join(destDir, apkName));
        console.log(`[Android] Copied APK to ${destDir}`);

        // 复制 Instant App APK（如果存在）
        const androidInstant = (options as any).androidInstant || false;
        if (androidInstant) {
            const instantApkName = `instantapp-${suffix}.apk`;
            const instantApkPath = ps.join(this.paths.nativePrjDir, `build/instantapp/outputs/apk/${suffix}/${instantApkName}`);
            if (fs.existsSync(instantApkPath)) {
                fs.copyFileSync(instantApkPath, ps.join(destDir, instantApkName));
                console.log(`[Android] Copied Instant App APK to ${destDir}`);
            }
        }

        // 复制 App Bundle（如果存在）
        const appBundle = (options as any).appBundle || false;
        if (appBundle) {
            const bundleName = `${this.params.projectName}-${suffix}.aab`;
            const bundlePath = ps.join(this.outputsDir(), `bundle/${suffix}/${bundleName}`);
            if (fs.existsSync(bundlePath)) {
                fs.copyFileSync(bundlePath, ps.join(destDir, bundleName));
                console.log(`[Android] Copied App Bundle to ${destDir}`);
            }
        }

        return true;
    }

    static async openWithIDE(nativePrjDir: string, androidStudioDir?: string) {
        // 打开 Android Studio
        // 这里需要根据实际的 Android Studio 路径来调用
        if (androidStudioDir) {
            const studioExe = ps.join(androidStudioDir, 'bin', 'studio64.exe');
            if (fs.existsSync(studioExe)) {
                cchelper.runCmd(studioExe, [nativePrjDir], false);
                return true;
            }
        }
        console.warn('Android Studio path not found');
        return false;
    }

    /**
     * 获取 APK 路径
     * 参考 packages/engine 的实现
     */
    getApkPath(): string {
        const suffix = this.params.debug ? 'debug' : 'release';
        // 使用项目名而不是 ASCII 版本，与 settings.gradle 中的项目名保持一致
        const apkName = `${this.params.projectName}-${suffix}.apk`;
        return ps.join(this.outputsDir(), `apk/${suffix}/${apkName}`);
    }

    /**
     * 获取构建输出目录
     * 参考 packages/engine 的实现
     */
    protected outputsDir(): string {
        // 使用项目名而不是 ASCII 版本，与 settings.gradle 中的项目名保持一致
        const folderName = this.params.projectName;
        const targetDir = ps.join(this.paths.nativePrjDir, 'build', folderName);
        const fallbackDir = ps.join(this.paths.nativePrjDir, 'build', this.params.projectName);
        return ps.join(fs.existsSync(targetDir) ? targetDir : fallbackDir, 'outputs');
    }

    async getExecutableFile() {
        const apkPath = this.getApkPath();
        if (!fs.existsSync(apkPath)) {
            throw new Error(`[Android] APK file not found at ${apkPath}`);
        }
        return apkPath;
    }

    /**
     * 获取 ADB 路径
     * 参考 packages/engine 的实现
     */
    getAdbPath(): string {
        const sdkPath = this.params.platformParams.sdkPath;
        return ps.join(
            sdkPath,
            `platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`
        );
    }

    /**
     * 检查是否有设备连接
     * 参考 packages/engine 的实现
     */
    checkConnectedDevices(adbPath: string): boolean {
        const { spawnSync } = require('child_process');
        const cp = spawnSync(adbPath, ['devices'], { 
            shell: true, 
            env: process.env, 
            cwd: process.cwd() 
        });
        
        if (cp.stderr && cp.stderr.length > 0) {
            console.log(`[adb devices] stderr: ${cp.stderr.toString('utf8')}`);
        }
        if (cp.error) {
            console.log(`[adb devices] error: ${cp.error}`);
        }
        if (cp.output && cp.output.length > 1) {
            for (const chunk of cp.output) {
                if (chunk) {
                    const chunkStr = chunk.toString();
                    const lines = chunkStr.split('\n');
                    for (const line of lines) {
                        if (/^[0-9a-zA-Z]+\s+\w+/.test(line)) {
                            return true; // device connected
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * 检查 APK 是否已安装
     * 参考 packages/engine 的实现
     */
    async checkApkInstalled(adbPath: string): Promise<boolean> {
        const { spawn } = require('child_process');
        const packageName = this.params.platformParams.packageName;
        
        return new Promise((resolve) => {
            const cp = spawn(
                adbPath,
                [
                    'shell', 'pm', 'list', 'packages', '|', 'grep',
                    packageName,
                ],
                {
                    shell: true,
                    env: process.env,
                    cwd: process.cwd(),
                }
            );
            
            let output = '';
            cp.stdout.on('data', (chunk: Buffer) => {
                output += chunk.toString();
            });
            cp.stderr.on('data', () => {
                // ignore stderr
            });
            cp.on('close', () => {
                resolve(output.includes(packageName));
            });
        });
    }

    /**
     * 安装 APK
     * 参考 packages/engine 的实现
     */
    async install(): Promise<boolean> {
        const apkPath = this.getApkPath();
        const adbPath = this.getAdbPath();

        if (!fs.existsSync(apkPath)) {
            throw new Error(`[Android] Cannot find APK at ${apkPath}`);
        }

        if (!fs.existsSync(adbPath)) {
            throw new Error(`[Android] Cannot find ADB at ${adbPath}`);
        }

        if (!this.checkConnectedDevices(adbPath)) {
            console.error(`[Android] Cannot find any connected devices, please connect your device or start an Android emulator`);
            return false;
        }

        // 如果已安装，先卸载
        if (await this.checkApkInstalled(adbPath)) {
            await cchelper.runCmd(
                adbPath,
                ['uninstall', this.params.platformParams.packageName],
                false
            );
        }

        // 安装 APK
        await cchelper.runCmd(adbPath, ['install', '-r', apkPath], false);
        return true;
    }

    /**
     * 启动应用
     * 参考 packages/engine 的实现
     */
    async startApp(): Promise<boolean> {
        const adbPath = this.getAdbPath();
        const packageName = this.params.platformParams.packageName;
        await cchelper.runCmd(
            adbPath,
            [
                'shell', 'am', 'start', '-n',
                `${packageName}/com.cocos.game.AppActivity`,
            ],
            false
        );
        return true;
    }

    async run(): Promise<boolean> {
        if (await this.install()) {
            return await this.startApp();
        }
        return false;
    }
}

