import i18n from 'i18next';
import fs from 'fs';
import path from 'path';

// 加载指定语言下的所有 JSON 文件并合并为扁平结构
function loadLanguageResources(language: string): Record<string, any> {
    const localesDir = path.join(__dirname, '../../static/i18n', language);
    const resources: Record<string, any> = {};

    try {
        if (fs.existsSync(localesDir)) {
            const files = fs.readdirSync(localesDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            for (const file of jsonFiles) {
                const filePath = path.join(localesDir, file);
                const data = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(data);

                // 将文件名（去掉.json）作为前缀，合并到扁平结构中
                const namespace = file.replace('.json', '');

                // 递归合并对象，添加命名空间前缀
                function mergeWithPrefix(obj: any, prefix: string) {
                    for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                            const newKey = prefix ? `${prefix}.${key}` : key;
                            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                                mergeWithPrefix(obj[key], newKey);
                            } else {
                                resources[newKey] = obj[key];
                            }
                        }
                    }
                }

                mergeWithPrefix(parsed, namespace);
            }
        }
    } catch (error) {
        console.error(`Load language resources failed (${language}):`, error);
    }

    return resources;
}

// 纯 Node.js 初始化 
i18n.init({
    // 基础配置
    lng: 'en',
    fallbackLng: 'en',

    // 资源数据 - 扁平结构，不使用命名空间
    resources: {
        en: {
            translation: loadLanguageResources('en')
        },
        zh: {
            translation: loadLanguageResources('zh')
        }
    },

    // 调试
    debug: process.env.NODE_ENV === 'development',

    // 插值配置 - 支持 {key} 格式（兼容旧版本）
    interpolation: {
        format: function (value, _format, _lng) {
            return value;
        },
        escapeValue: false, // React 已经做了转义
        formatSeparator: ',',
        unescapeSuffix: '',
        unescapePrefix: '',
        prefix: '{',
        suffix: '}'
    }

}, (err) => {
    if (err) {
        console.error('i18n 初始化失败:', err);
    }
});

export default i18n;