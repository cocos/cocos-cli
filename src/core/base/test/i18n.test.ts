import i18n from '../i18n';

describe('i18n 功能测试', () => {
    beforeEach(async () => {
        // 等待 i18n 初始化完成
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('基本翻译功能 - 英文模式', () => {
        i18n.setLanguage('en');

        expect(i18n.t('common.loading')).toBe('Loading...');
        expect(i18n.t('common.success')).toBe('Success');
        expect(i18n.t('common.error')).toBe('Error');
        expect(i18n.t('assets.title')).toBe('Asset Database');
    });

    test('基本翻译功能 - 中文模式', () => {
        i18n.setLanguage('zh');

        expect(i18n.t('common.loading')).toBe('加载中...');
        expect(i18n.t('common.success')).toBe('成功');
        expect(i18n.t('common.error')).toBe('错误');
        expect(i18n.t('assets.title')).toBe('资源数据库');
    });

    test('带参数的翻译 - 英文模式', () => {
        i18n.setLanguage('en');

        const deprecatedTip = i18n.t('assets.deprecated_tip', {
            oldName: 'oldAPI',
            version: '3.0',
            newName: 'newAPI'
        });
        expect(deprecatedTip).toBe('oldAPI has been deprecated in version 3.0, please replace with newAPI');

        const globalReadonlyTip = i18n.t('assets.global_readonly_tip', { name: 'globalVar' });
        expect(globalReadonlyTip).toBe('Global variable globalVar field is already used by asset process and cannot be overwritten, please use other field');
    });

    test('带参数的翻译 - 中文模式', () => {
        i18n.setLanguage('zh');

        const deprecatedTip = i18n.t('assets.deprecated_tip', {
            oldName: 'oldAPI',
            version: '3.0',
            newName: 'newAPI'
        });
        expect(deprecatedTip).toBe('oldAPI 已在 3.0 版本废弃，请更换为 newAPI');

        const globalReadonlyTip = i18n.t('assets.global_readonly_tip', { name: 'globalVar' });
        expect(globalReadonlyTip).toBe('全局变量 globalVar 字段已被资源进程使用，不可重写，请更换其他字段');
    });

    test('不同命名空间的翻译', () => {
        i18n.setLanguage('zh');

        expect(i18n.t('common.loading')).toBe('加载中...');
        expect(i18n.t('assets.title')).toBe('资源数据库');
        expect(i18n.t('assets.description')).toBe('Cocos Creator 资源管理器');
        expect(i18n.t('builder.tasks.sort_asset_bundle')).toBe('查询 Asset Bundle');
    });

    test('不存在的 key 处理', () => {
        // 测试不存在的键会返回原键名
        expect(i18n.t('nonexistent.key' as any)).toBe('nonexistent.key');
        expect(i18n.t('nonexistent.loading' as any)).toBe('nonexistent.loading');
    });

    test('语言切换功能', () => {
        const testKey = 'common.success';

        // 设置为中文
        i18n.setLanguage('zh');
        expect(i18n._lang).toBe('zh');
        expect(i18n.t(testKey)).toBe('成功');

        // 切换为英文
        i18n.setLanguage('en');
        expect(i18n._lang).toBe('en');
        expect(i18n.t(testKey)).toBe('Success');
    });
});
