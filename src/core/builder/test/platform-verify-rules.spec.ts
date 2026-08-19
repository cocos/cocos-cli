import androidConfig from '../platforms/android/src/config';
import googlePlayConfig from '../platforms/google-play/src/config';
import harmonyosNextConfig from '../platforms/harmonyos-next/src/config';
import huaweiAgcConfig from '../platforms/huawei-agc/src/config';
import iosConfig from '../platforms/ios/src/config';
import windowsConfig from '../platforms/windows/src/config';
import ohosConfig from '../platforms/ohos/src/config';
import { validatorManager } from '../share/validator-manager';

describe('platform verifyRuleMap migrated from editor', () => {
    describe('android keystore rules', () => {
        const required = androidConfig.verifyRuleMap!.keystoreRequired;
        const notEmpty = androidConfig.verifyRuleMap!.keystoreNotEmpty;

        it('useDebugKeystore=true 时两条规则都放行任何值', () => {
            const options = { packages: { android: { useDebugKeystore: true } } };
            for (const rule of [required, notEmpty]) {
                expect(rule.func('', options)).toBe(true);
                expect(rule.func(undefined as any, options)).toBe(true);
                expect(rule.func(null as any, options)).toBe(true);
                expect(rule.func('/foo', options)).toBe(true);
            }
        });

        it('useDebugKeystore=false 时 keystoreRequired 拒 undefined/null（未设置），放行空串（交给 keystoreNotEmpty）', () => {
            const options = { packages: { android: { useDebugKeystore: false } } };
            expect(required.func(undefined as any, options)).toBe(false);
            expect(required.func(null as any, options)).toBe(false);
            expect(required.func('', options)).toBe(true);
            expect(required.func('/keystores/release.keystore', options)).toBe(true);
        });

        it('useDebugKeystore=false 时 keystoreNotEmpty 拒空串（设了但空），放行 undefined/null（交给 keystoreRequired）', () => {
            const options = { packages: { android: { useDebugKeystore: false } } };
            expect(notEmpty.func('', options)).toBe(false);
            expect(notEmpty.func(undefined as any, options)).toBe(true);
            expect(notEmpty.func(null as any, options)).toBe(true);
            expect(notEmpty.func('/keystores/release.keystore', options)).toBe(true);
        });

        it('四个 keystore 字段都同时挂了 keystoreRequired 和 keystoreNotEmpty', () => {
            const opts = androidConfig.options as any;
            for (const key of ['keystorePath', 'keystorePassword', 'keystoreAlias', 'keystoreAliasPassword']) {
                expect(opts[key].verifyRules).toEqual(['keystoreRequired', 'keystoreNotEmpty']);
            }
        });

        // checkBuildOption 逐字段校验时不合并平台默认值，useDebugKeystore 可能整个缺席，此时必须按默认值 true 放行
        it('useDebugKeystore 缺席时两条规则都放行（不能 fail-closed）', () => {
            for (const options of [
                { packages: { android: {} } },
                { packages: {} },
                {},
            ]) {
                for (const rule of [required, notEmpty]) {
                    expect(rule.func('', options)).toBe(true);
                    expect(rule.func(undefined as any, options)).toBe(true);
                    expect(rule.func(null as any, options)).toBe(true);
                }
            }
        });

        it('只有显式 false 才触发校验，其他 falsy 值不算', () => {
            expect(notEmpty.func('', { packages: { android: { useDebugKeystore: false } } })).toBe(false);
            expect(notEmpty.func('', { packages: { android: { useDebugKeystore: undefined } } })).toBe(true);
            expect(notEmpty.func('', { packages: { android: { useDebugKeystore: null } } })).toBe(true);
        });

        it('两条规则 message 语义有区分', () => {
            expect(required.message).toMatch(/Required/);
            expect(notEmpty.message).toMatch(/Cannot be empty/);
        });
    });

    describe('google-play keystore rules', () => {
        const required = googlePlayConfig.verifyRuleMap!.keystoreRequired;
        const notEmpty = googlePlayConfig.verifyRuleMap!.keystoreNotEmpty;

        it('useDebugKeystore=true 时两条规则都放行任何值', () => {
            const options = { packages: { 'google-play': { useDebugKeystore: true } } };
            for (const rule of [required, notEmpty]) {
                expect(rule.func('', options)).toBe(true);
                expect(rule.func(undefined as any, options)).toBe(true);
                expect(rule.func('/foo', options)).toBe(true);
            }
        });

        it('useDebugKeystore=false 时语义区分与 android 一致', () => {
            const options = { packages: { 'google-play': { useDebugKeystore: false } } };
            // keystoreRequired 只关心 undefined/null
            expect(required.func(undefined as any, options)).toBe(false);
            expect(required.func(null as any, options)).toBe(false);
            expect(required.func('', options)).toBe(true);
            // keystoreNotEmpty 只关心空串
            expect(notEmpty.func('', options)).toBe(false);
            expect(notEmpty.func(undefined as any, options)).toBe(true);
            expect(notEmpty.func('release.keystore', options)).toBe(true);
        });

        it('四个 keystore 字段都同时挂了 keystoreRequired 和 keystoreNotEmpty', () => {
            const opts = googlePlayConfig.options as any;
            for (const key of ['keystorePath', 'keystorePassword', 'keystoreAlias', 'keystoreAliasPassword']) {
                expect(opts[key].verifyRules).toEqual(['keystoreRequired', 'keystoreNotEmpty']);
            }
        });

        it('useDebugKeystore 缺席时两条规则都放行（与 android 一致）', () => {
            const options = { platform: 'google-play', packages: { 'google-play': {} } };
            for (const rule of [required, notEmpty]) {
                expect(rule.func('', options)).toBe(true);
                expect(rule.func(undefined as any, options)).toBe(true);
            }
        });
    });

    describe('harmonyos-next.packageName', () => {
        const rule = harmonyosNextConfig.verifyRuleMap!.packageName;

        it('合法包名通过', () => {
            expect(rule.func('com.example.game', {})).toBe(true);
            expect(rule.func('com.company.myapp2024', {})).toBe(true);
        });

        it('不符合正则的拒绝', () => {
            expect(rule.func('nopoint', {})).toBe(false);
            expect(rule.func('1com.example.game', {})).toBe(false);
            expect(rule.func('com..example', {})).toBe(false);
        });

        it('长度 < 7 的拒绝', () => {
            expect(rule.func('a.b.c', {})).toBe(false);
        });

        it('长度 > 128 的拒绝', () => {
            const long = 'com.' + 'x'.repeat(130);
            expect(rule.func(long, {})).toBe(false);
        });

        it('包含 HarmonyOS 保留关键字任一 token 的拒绝', () => {
            expect(rule.func('com.harmony.app', {})).toBe(false);
            expect(rule.func('com.harmonyos.game', {})).toBe(false);
            expect(rule.func('com.openharmony.demo', {})).toBe(false);
            expect(rule.func('com.system.myapp', {})).toBe(false);
            expect(rule.func('com.ohos.pkg', {})).toBe(false);
            // 保留字必须作为独立 token（下划线或段边界）；作为普通子串不触发
            expect(rule.func('com.example.harmonyish', {})).toBe(true);
            expect(rule.func('com.myoh.app', {})).toBe(true);
        });

        it('保留字被下划线包围的 token 也识别', () => {
            expect(rule.func('com.my_harmony_app.pkg', {})).toBe(false);
            expect(rule.func('com.foo.my_oh_bar', {})).toBe(false);
        });
    });

    describe('android apiLevel sub-rules', () => {
        const rules = androidConfig.verifyRuleMap!;

        it('apiLevelIsNumber 接受数字/数字字符串，拒 NaN/文本', () => {
            expect(rules.apiLevelIsNumber.func(23, {})).toBe(true);
            expect(rules.apiLevelIsNumber.func('23', {})).toBe(true);
            expect(rules.apiLevelIsNumber.func(NaN, {})).toBe(false);
            expect(rules.apiLevelIsNumber.func('foo', {})).toBe(false);
        });

        it('apiLevelInstant: androidInstant=false 时任何值通过；true 时 <23 拒', () => {
            const off = { packages: { android: { androidInstant: false } } };
            expect(rules.apiLevelInstant.func(15, off)).toBe(true);
            const on = { packages: { android: { androidInstant: true } } };
            expect(rules.apiLevelInstant.func(22, on)).toBe(false);
            expect(rules.apiLevelInstant.func(23, on)).toBe(true);
            expect(rules.apiLevelInstant.func(35, on)).toBe(true);
        });

        it('apiLevelTbb: JobSystem!==tbb 通过；===tbb 时 <21 拒（JobSystem 落在 packages[platform]）', () => {
            const withJob = (JobSystem: string) => ({ platform: 'android', packages: { android: { JobSystem } } });
            expect(rules.apiLevelTbb.func(15, withJob('other'))).toBe(true);
            expect(rules.apiLevelTbb.func(15, { platform: 'android', packages: {} })).toBe(true);
            expect(rules.apiLevelTbb.func(20, withJob('tbb'))).toBe(false);
            expect(rules.apiLevelTbb.func(21, withJob('tbb'))).toBe(true);
        });

        it('apiLevelRenderPipeline: 非延迟渲染管线 uuid 通过；命中且 <21 拒', () => {
            const deferredUuid = '5d45ba66-829a-46d3-948e-2ed3fa7ee421';
            expect(rules.apiLevelRenderPipeline.func(15, { renderPipeline: 'other' })).toBe(true);
            expect(rules.apiLevelRenderPipeline.func(15, {})).toBe(true);
            expect(rules.apiLevelRenderPipeline.func(20, { renderPipeline: deferredUuid })).toBe(false);
            expect(rules.apiLevelRenderPipeline.func(21, { renderPipeline: deferredUuid })).toBe(true);
        });

        it('apiLevelMin19: <19 拒，>=19 通过', () => {
            expect(rules.apiLevelMin19.func(18, {})).toBe(false);
            expect(rules.apiLevelMin19.func(19, {})).toBe(true);
            expect(rules.apiLevelMin19.func(35, {})).toBe(true);
        });

        it('apiLevel 字段串起了 required + 5 条子规则，顺序不变', () => {
            const apiLevel = (androidConfig.options as any).apiLevel;
            expect(apiLevel.verifyRules).toEqual([
                'required',
                'apiLevelIsNumber',
                'apiLevelInstant',
                'apiLevelTbb',
                'apiLevelRenderPipeline',
                'apiLevelMin19',
            ]);
        });
    });

    describe('google-play apiLevel sub-rules', () => {
        const rules = googlePlayConfig.verifyRuleMap!;

        it('apiLevelMin24: <24 拒，>=24 通过（Google Play 政策）', () => {
            expect(rules.apiLevelMin24.func(19, {})).toBe(false);
            expect(rules.apiLevelMin24.func(23, {})).toBe(false);
            expect(rules.apiLevelMin24.func(24, {})).toBe(true);
            expect(rules.apiLevelMin24.func(35, {})).toBe(true);
        });

        it('apiLevelTbb: 保留引擎技术约束（数值上被 24 覆盖，不会 fire，仅文档化）', () => {
            const withJob = (JobSystem: string) => ({ platform: 'google-play', packages: { 'google-play': { JobSystem } } });
            expect(rules.apiLevelTbb.func(24, withJob('other'))).toBe(true);
            expect(rules.apiLevelTbb.func(24, { platform: 'google-play', packages: {} })).toBe(true);
            expect(rules.apiLevelTbb.func(20, withJob('tbb'))).toBe(false);
            expect(rules.apiLevelTbb.func(24, withJob('tbb'))).toBe(true);
        });

        it('apiLevelRenderPipeline: 保留引擎技术约束（数值上被 24 覆盖）', () => {
            const deferredUuid = '5d45ba66-829a-46d3-948e-2ed3fa7ee421';
            expect(rules.apiLevelRenderPipeline.func(24, { renderPipeline: 'other' })).toBe(true);
            expect(rules.apiLevelRenderPipeline.func(20, { renderPipeline: deferredUuid })).toBe(false);
            expect(rules.apiLevelRenderPipeline.func(24, { renderPipeline: deferredUuid })).toBe(true);
        });

        it('apiLevel 字段串起了 required + isNumber + Min24 + tbb + renderPipeline（min24 先兜底政策提示）', () => {
            const apiLevel = (googlePlayConfig.options as any).apiLevel;
            expect(apiLevel.verifyRules).toEqual([
                'required',
                'apiLevelIsNumber',
                'apiLevelMin24',
                'apiLevelTbb',
                'apiLevelRenderPipeline',
            ]);
        });

        it('apiLevelInstant 未挂载（editor 有，本轮未加）', () => {
            expect(rules.apiLevelInstant).toBeUndefined();
        });
    });

    // ============ 迁移自 editor verificationFunc 其余 case ============

    describe('android.appABIs / renderBackEnd / orientation（"至少一项"约束）', () => {
        const rules = androidConfig.verifyRuleMap!;

        it('appABIs: 空数组拒；非空数组通过；非数组类型拒', () => {
            expect(rules.appABIs.func([], {})).toBe(false);
            expect(rules.appABIs.func(['arm64-v8a'], {})).toBe(true);
            expect(rules.appABIs.func(undefined as any, {})).toBe(false);
            expect(rules.appABIs.func({} as any, {})).toBe(false);
        });

        it('renderBackEnd: 无一 backend 开启拒；至少 1 个支持的 backend 开启通过', () => {
            expect(rules.renderBackEnd.func({ vulkan: false, gles3: false, gles2: false }, {})).toBe(false);
            expect(rules.renderBackEnd.func({ vulkan: false, gles3: true, gles2: false }, {})).toBe(true);
            expect(rules.renderBackEnd.func({} as any, {})).toBe(false);
            expect(rules.renderBackEnd.func(null as any, {})).toBe(false);
        });

        it('renderBackEnd: 不支持的 backend key（如 metal）单独 true 不算合法', () => {
            // 用户传 { metal: true } 给 android，虽然 truthy 但不是 android 支持的 backend → 拒
            expect(rules.renderBackEnd.func({ metal: true }, {})).toBe(false);
            // 混合：即使 metal:true，只要有一个 android 支持的 backend 开启就通过
            expect(rules.renderBackEnd.func({ metal: true, gles3: true }, {})).toBe(true);
        });

        it('orientation: 无一方向开启拒；至少 1 个 true 通过', () => {
            expect(rules.orientation.func({ portrait: false, landscapeRight: false, landscapeLeft: false }, {})).toBe(false);
            expect(rules.orientation.func({ portrait: false, landscapeRight: true, landscapeLeft: false }, {})).toBe(true);
            expect(rules.orientation.func(null as any, {})).toBe(false);
        });

        it('三个字段各挂对应的 verifyRules', () => {
            const opts = androidConfig.options as any;
            expect(opts.appABIs.verifyRules).toEqual(['appABIs']);
            expect(opts.renderBackEnd.verifyRules).toEqual(['renderBackEnd']);
            expect(opts.orientation.verifyRules).toEqual(['orientation']);
        });
    });

    describe('android.maxAspectRatioRequired（resizeableActivity=false 时的格式/下限）', () => {
        const rule = androidConfig.verifyRuleMap!.maxAspectRatioRequired;

        it('resizeableActivity 缺省 / true 时任何值都放行（含空/非法）', () => {
            expect(rule.func('', { packages: { android: {} } })).toBe(true);
            expect(rule.func('garbage', { packages: { android: { resizeableActivity: true } } })).toBe(true);
        });

        it('resizeableActivity=false + 合法值（小数）通过', () => {
            const options = { packages: { android: { resizeableActivity: false } } };
            expect(rule.func('2.4', options)).toBe(true);
            expect(rule.func('1.33', options)).toBe(true);
        });

        it('resizeableActivity=false + "w:h" 比例通过', () => {
            const options = { packages: { android: { resizeableActivity: false } } };
            expect(rule.func('4:3', options)).toBe(true);
            expect(rule.func('16:9', options)).toBe(true);
        });

        it('resizeableActivity=false + "n.n (w:h)" 组合通过', () => {
            const options = { packages: { android: { resizeableActivity: false } } };
            expect(rule.func('1.78 (16:9)', options)).toBe(true);
        });

        it('resizeableActivity=false 时低于 1.33 的值拒', () => {
            const options = { packages: { android: { resizeableActivity: false } } };
            expect(rule.func('1.0', options)).toBe(false);
            expect(rule.func('3:4', options)).toBe(false); // 0.75 < 1.33
            expect(rule.func('1:1', options)).toBe(false); // 1.0 < 1.33
            expect(rule.func('0:0', options)).toBe(false); // 分子分母为 0
            expect(rule.func('16:0', options)).toBe(false);
        });

        it('resizeableActivity=true（默认）时 0:0 / 1:1 这类值也放行——该字段此时不写入 manifest', () => {
            const options = { packages: { android: { resizeableActivity: true } } };
            expect(rule.func('0:0', options)).toBe(true);
            expect(rule.func('1:1', options)).toBe(true);
        });

        it('resizeableActivity=false 时空值 / 非法格式拒（Required 结尾使空值也进 func）', () => {
            const options = { packages: { android: { resizeableActivity: false } } };
            expect(rule.func('', options)).toBe(false);
            expect(rule.func('   ', options)).toBe(false);
            expect(rule.func('abc', options)).toBe(false);
            expect(rule.func(null as any, options)).toBe(false);
        });

        it('maxAspectRatio 字段挂了 maxAspectRatioRequired', () => {
            expect((androidConfig.options as any).maxAspectRatio.verifyRules).toEqual(['maxAspectRatioRequired']);
        });
    });

    describe('android.remoteUrlHttp（androidInstant=true 时的 http 前缀）', () => {
        const rule = androidConfig.verifyRuleMap!.remoteUrlHttp;

        it('androidInstant=false 时任何值都放行', () => {
            expect(rule.func('ftp://foo', { packages: { android: { androidInstant: false } } })).toBe(true);
            expect(rule.func('', { packages: { android: {} } })).toBe(true);
        });

        it('androidInstant=true 时空值放行（editor 保持）', () => {
            const options = { packages: { android: { androidInstant: true } } };
            expect(rule.func('', options)).toBe(true);
            expect(rule.func(undefined as any, options)).toBe(true);
        });

        it('androidInstant=true 时非空值必须 http 前缀', () => {
            const options = { packages: { android: { androidInstant: true } } };
            expect(rule.func('http://foo.com', options)).toBe(true);
            expect(rule.func('https://foo.com', options)).toBe(true);
            expect(rule.func('ftp://foo.com', options)).toBe(false);
            expect(rule.func('foo.com', options)).toBe(false);
        });

        it('remoteUrl 字段挂了 remoteUrlHttp', () => {
            expect((androidConfig.options as any).remoteUrl.verifyRules).toEqual(['remoteUrlHttp']);
        });
    });

    describe('google-play 也补齐同套规则', () => {
        const rules = googlePlayConfig.verifyRuleMap!;

        it('appABIs / renderBackEnd / orientation 语义与 android 一致（含"未知 backend key 不算合法"）', () => {
            expect(rules.appABIs.func([], {})).toBe(false);
            expect(rules.appABIs.func(['arm64-v8a'], {})).toBe(true);
            expect(rules.renderBackEnd.func({ vulkan: false, gles3: false, gles2: false }, {})).toBe(false);
            expect(rules.renderBackEnd.func({ vulkan: true }, {})).toBe(true);
            expect(rules.renderBackEnd.func({ metal: true }, {})).toBe(false);
            expect(rules.orientation.func({ portrait: false, landscapeRight: false, landscapeLeft: false, upsideDown: false }, {})).toBe(false);
            expect(rules.orientation.func({ landscapeLeft: true }, {})).toBe(true);
        });

        it('maxAspectRatioRequired 读的是 packages["google-play"].resizeableActivity', () => {
            expect(rules.maxAspectRatioRequired.func('', { packages: { 'google-play': { resizeableActivity: false } } })).toBe(false);
            expect(rules.maxAspectRatioRequired.func('2.4', { packages: { 'google-play': { resizeableActivity: false } } })).toBe(true);
            expect(rules.maxAspectRatioRequired.func('garbage', { packages: { 'google-play': { resizeableActivity: true } } })).toBe(true);
        });

        it('remoteUrlHttp 读的是 packages["google-play"].androidInstant', () => {
            expect(rules.remoteUrlHttp.func('ftp://a', { packages: { 'google-play': { androidInstant: true } } })).toBe(false);
            expect(rules.remoteUrlHttp.func('http://a', { packages: { 'google-play': { androidInstant: true } } })).toBe(true);
            expect(rules.remoteUrlHttp.func('ftp://a', { packages: { 'google-play': { androidInstant: false } } })).toBe(true);
        });

        it('五个字段都挂上对应 verifyRules', () => {
            const opts = googlePlayConfig.options as any;
            expect(opts.appABIs.verifyRules).toEqual(['appABIs']);
            expect(opts.renderBackEnd.verifyRules).toEqual(['renderBackEnd']);
            expect(opts.orientation.verifyRules).toEqual(['orientation']);
            expect(opts.maxAspectRatio.verifyRules).toEqual(['maxAspectRatioRequired']);
            expect(opts.remoteUrl.verifyRules).toEqual(['remoteUrlHttp']);
        });
    });

    describe('huawei-agc 复用 android 配置（走 validatorManager 的真实流）', () => {
        // 与 plugin.ts 注册规则时的 key 一致：platform + pkgName
        const PKG = 'huawei-agchuawei-agc';
        const KEYSTORE_KEYS = ['keystorePath', 'keystorePassword', 'keystoreAlias', 'keystoreAliasPassword'];

        beforeAll(() => {
            for (const [name, rule] of Object.entries(huaweiAgcConfig.verifyRuleMap!)) {
                validatorManager.addRule(name, rule as any, PKG);
            }
        });

        function check(key: string, value: unknown, pkgOptions: Record<string, unknown>) {
            const rules = (huaweiAgcConfig.options as any)[key].verifyRules as string[];
            return validatorManager.check(value, rules, {
                platform: 'huawei-agc',
                packages: { 'huawei-agc': pkgOptions },
            }, PKG);
        }

        it('整套 android 规则被继承下来（spread androidConfig）', () => {
            expect(huaweiAgcConfig.verifyRuleMap).toBe(androidConfig.verifyRuleMap);
            for (const key of KEYSTORE_KEYS) {
                expect((huaweiAgcConfig.options as any)[key].verifyRules).toEqual(['keystoreRequired', 'keystoreNotEmpty']);
            }
            expect((huaweiAgcConfig.options as any).maxAspectRatio.verifyRules).toEqual(['maxAspectRatioRequired']);
        });

        it('useDebugKeystore=true（默认）时 keystore 字段留空不报错', async () => {
            for (const key of KEYSTORE_KEYS) {
                await expect(check(key, '', { useDebugKeystore: true })).resolves.toBe('');
                await expect(check(key, undefined, { useDebugKeystore: true })).resolves.toBe('');
            }
        });

        it('useDebugKeystore=false 时 keystore 字段留空照样报错', async () => {
            for (const key of KEYSTORE_KEYS) {
                await expect(check(key, '', { useDebugKeystore: false })).resolves.toMatch(/Cannot be empty/);
            }
            await expect(check('keystorePath', '/release.keystore', { useDebugKeystore: false })).resolves.toBe('');
        });

        // 模拟 checkBuildOption 的形态：createVerifyOptions 只 clone 调用方传入的 options，不合并平台默认值
        it('调用方只传被校验字段（useDebugKeystore 缺席）时不误报', async () => {
            for (const key of KEYSTORE_KEYS) {
                await expect(check(key, '', {})).resolves.toBe('');
            }
        });

        it('resizeableActivity 默认 true 时 maxAspectRatio 不校验，false 时校验', async () => {
            await expect(check('maxAspectRatio', '1:1', { resizeableActivity: true })).resolves.toBe('');
            await expect(check('maxAspectRatio', '1:1', { resizeableActivity: false })).resolves.toMatch(/1\.33/);
        });

        it('apiLevel 的联动分支也按 huawei-agc 包名生效', async () => {
            await expect(check('apiLevel', 22, { androidInstant: true })).resolves.toMatch(/23/);
            await expect(check('apiLevel', 23, { androidInstant: true })).resolves.toBe('');
            await expect(check('apiLevel', 20, { JobSystem: 'tbb' })).resolves.toMatch(/21/);
            await expect(check('apiLevel', 18, {})).resolves.toMatch(/19/);
        });

        it('remoteUrl 只在 androidInstant=true 时要求 http 前缀', async () => {
            await expect(check('remoteUrl', 'ftp://a', { androidInstant: false })).resolves.toBe('');
            await expect(check('remoteUrl', 'ftp://a', { androidInstant: true })).resolves.toMatch(/http/);
        });
    });

    // ============ 对齐 editor verificationFunc 的剩余平台 ============

    describe('ios targetVersion / orientation / osTarget', () => {
        const rules = iosConfig.verifyRuleMap!;
        const opts = iosConfig.options as any;

        it('targetVersionStyle 只接受 x.x / x.x.x（每段范围对齐 editor 正则）', () => {
            expect(rules.targetVersionStyle.func('12.0', {})).toBe(true);
            expect(rules.targetVersionStyle.func('12.0.1', {})).toBe(true);
            expect(rules.targetVersionStyle.func('12', {})).toBe(false);
            expect(rules.targetVersionStyle.func('012.0', {})).toBe(false);
            expect(rules.targetVersionStyle.func('12.0.1.2', {})).toBe(false);
            expect(rules.targetVersionStyle.func('abc', {})).toBe(false);
        });

        it('targetVersionMin: 低于 11.0 拒；逐段比较，不会把 9.10 误判成 >= 11.0', () => {
            expect(rules.targetVersionMin.func('11.0', {})).toBe(true);
            expect(rules.targetVersionMin.func('12.0', {})).toBe(true);
            expect(rules.targetVersionMin.func('10.9', {})).toBe(false);
            expect(rules.targetVersionMin.func('9.10', {})).toBe(false);
        });

        it('targetVersionTaskFlow: JobSystem=taskFlow 时下限提到 12.0', () => {
            const on = { platform: 'ios', packages: { ios: { JobSystem: 'taskFlow' } } };
            expect(rules.targetVersionTaskFlow.func('11.0', on)).toBe(false);
            expect(rules.targetVersionTaskFlow.func('12.0', on)).toBe(true);
            expect(rules.targetVersionTaskFlow.func('11.0', { platform: 'ios', packages: { ios: {} } })).toBe(true);
        });

        it('orientation / osTarget 至少开一项', () => {
            expect(rules.orientation.func({ portrait: false, landscapeLeft: false }, {})).toBe(false);
            expect(rules.orientation.func({ portrait: false, landscapeLeft: true }, {})).toBe(true);
            expect(rules.orientation.func(null as any, {})).toBe(false);
            expect(rules.osTarget.func({ iphoneos: false, simulator: false }, {})).toBe(false);
            expect(rules.osTarget.func({ iphoneos: false, simulator: true }, {})).toBe(true);
        });

        it('三个字段都挂上 verifyRules，默认值全部合法', () => {
            expect(opts.targetVersion.verifyRules).toEqual(['required', 'targetVersionStyle', 'targetVersionTaskFlow', 'targetVersionMin']);
            expect(opts.orientation.verifyRules).toEqual(['orientation']);
            expect(opts.osTarget.verifyRules).toEqual(['osTarget']);
            expect(rules.targetVersionStyle.func(opts.targetVersion.default, {})).toBe(true);
            expect(rules.targetVersionMin.func(opts.targetVersion.default, {})).toBe(true);
            expect(rules.orientation.func(opts.orientation.default, {})).toBe(true);
            expect(rules.osTarget.func(opts.osTarget.default, {})).toBe(true);
        });
    });

    describe('windows renderBackEnd', () => {
        const rule = windowsConfig.verifyRuleMap!.renderBackEnd;

        it('全关拒，至少一个支持的后端开启通过', () => {
            expect(rule.func({ vulkan: false, gles3: false, gles2: false }, {})).toBe(false);
            expect(rule.func({ vulkan: true }, {})).toBe(true);
            expect(rule.func({ metal: true }, {})).toBe(false);
            expect(rule.func(null as any, {})).toBe(false);
        });

        it('字段挂上 verifyRules，默认值合法', () => {
            const opts = windowsConfig.options as any;
            expect(opts.renderBackEnd.verifyRules).toEqual(['renderBackEnd']);
            expect(rule.func(opts.renderBackEnd.default, {})).toBe(true);
        });
    });

    describe('ohos orientation', () => {
        const rule = ohosConfig.verifyRuleMap!.orientation;

        it('全关拒，至少一个方向开启通过，默认值合法', () => {
            expect(rule.func({ portrait: false, landscapeRight: false, landscapeLeft: false }, {})).toBe(false);
            expect(rule.func({ portrait: true }, {})).toBe(true);
            expect(rule.func(null as any, {})).toBe(false);
            const opts = ohosConfig.options as any;
            expect(opts.orientation.verifyRules).toEqual(['orientation']);
            expect(rule.func(opts.orientation.default, {})).toBe(true);
        });
    });

    describe('harmonyos-next renderBackEnd / orientation / deviceTypes', () => {
        const rules = harmonyosNextConfig.verifyRuleMap!;
        const opts = harmonyosNextConfig.options as any;

        it('三条规则都是"至少开一项"', () => {
            expect(rules.renderBackEnd.func({ vulkan: false, gles3: false, gles2: false }, {})).toBe(false);
            expect(rules.renderBackEnd.func({ gles3: true }, {})).toBe(true);
            expect(rules.renderBackEnd.func({ vulkan: true }, {})).toBe(true);
            expect(rules.renderBackEnd.func({ gles2: true }, {})).toBe(true);
            expect(rules.renderBackEnd.func({ metal: true }, {})).toBe(false);
            expect(rules.orientation.func({ portrait: false, landscapeLeft: false }, {})).toBe(false);
            expect(rules.orientation.func({ landscapeLeft: true }, {})).toBe(true);
            expect(rules.deviceTypes.func({ phone: false, default: false }, {})).toBe(false);
            expect(rules.deviceTypes.func({ default: true }, {})).toBe(true);
            expect(rules.deviceTypes.func(null as any, {})).toBe(false);
        });

        it('三个字段都挂上 verifyRules', () => {
            expect(opts.renderBackEnd.verifyRules).toEqual(['renderBackEnd']);
            expect(opts.orientation.verifyRules).toEqual(['orientation']);
            expect(opts.deviceTypes.verifyRules).toEqual(['deviceTypes']);
        });

        it('三个字段默认值都合法；renderBackEnd 默认只开 gles3', () => {
            expect(rules.orientation.func(opts.orientation.default, {})).toBe(true);
            expect(rules.deviceTypes.func(opts.deviceTypes.default, {})).toBe(true);
            expect(opts.renderBackEnd.default).toEqual({ vulkan: false, gles3: true, gles2: false });
            expect(rules.renderBackEnd.func(opts.renderBackEnd.default, {})).toBe(true);
        });
    });
});
