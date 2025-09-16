import { FileNameCheckConfig } from "../../../@types/protected";

export class ScriptNameChecker {
    classNameStringFormat: string; // 支持增加前缀或后缀
    requiredCamelCaseClassName: boolean;

    static camelFormatReg = /@ccclass([^<]*)(<%CamelCaseClassName%>)/;
    static classNameFormatReg = /@ccclass\(['"]([^'"]*)['"]\)/;
    static commentsReg = /(\n[^\n]*\/\*[\s\S]*?\*\/)|(\n[^\n]*\/\/(?:[^\r\n]|\r(?!\n))*)/g; // 注释区域连同连续的空行

    static invalidClassNameReg = /^[\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}\$_]*$/u;

    static getDefaultClassName() {
        return DefaultClassName;
    }

    constructor(requiredCamelCaseClassName: boolean, classNameStringFormat: string) {
        this.requiredCamelCaseClassName = requiredCamelCaseClassName;
        this.classNameStringFormat = classNameStringFormat;
    }
    async isValid(fileName: string) {
        let className = '';

        if (this.requiredCamelCaseClassName) {
            const validName = this.getValidCamelCaseClassName(fileName);
            className = this.classNameStringFormat.replace('<%CamelCaseClassName%>', validName).trim() || validName;
        } else {
            const validName = ScriptNameChecker.getValidClassName(fileName);
            className = this.classNameStringFormat.replace('<%UnderscoreCaseClassName%>', validName).trim() || validName;
        }

        if (!className) {
            return { state: 'i18n:assets.operate.errorScriptClassName' };
        }

        return { state: '' };
    }
    async getValidFileName(fileName: string) {
        fileName = fileName.trim().replace(/[^a-zA-Z0-9_-]/g, '');

        // 此接口被其他位置直接调用，可能传入纯数字如 001，需要处理，否则死循环
        // @ts-ignore
        if (!fileName || isFinite(fileName)) {
            fileName = 'NewComponent';
        }

        const baseName = fileName;
        let index = 0;
        while ((await this.isValid(fileName)).state) {
            // 容错，避免死循环
            if (index > 1000) {
                return fileName;
            }
            index++;
            const padString = `-${index.toString().padStart(3, '0')}`;
            fileName = `${baseName}${padString}`;
        }

        return fileName;
    }
    static getValidClassName(fileName: string) {
        /**
         * 尽量与文件名称一致
         * 头部不能有数字
         * 不含特殊字符
         * 其他情况包括 className 是某个 js 关键词，就报错出来。
         * 0my class_name-for#demo! 转后为 MyClassNameForDemo
         */
        fileName = fileName.trim().replace(/^[^a-zA-Z_]+/g, '');
        const parts = fileName.match(/[a-zA-Z0-9_]+/g);
        if (parts) {
            return parts.join('_');
        }

        return '';
    }

    getValidCamelCaseClassName(fileName: string) {
        /**
         * 类名转为大驼峰格式:
         * 头部不能有数字
         * 不含特殊字符
         * 符号和空格作为间隔，每个间隔后的首字母大写，如：
         * 0my class_name-for#demo! 转后为 MyClassNameForDemo
         */
        fileName = fileName.trim().replace(/^[^a-zA-Z]+/g, '');
        const parts = fileName.match(/[a-zA-Z0-9]+/g);
        if (parts) {
            return parts
                .filter(Boolean)
                .map((part) => part[0].toLocaleUpperCase() + part.substr(1))
                .join('');
        }

        return '';
    }
}

export class ScriptNameCheckerManager {
    static async getScriptChecker(templateContent: string) {
        // 识别是否启用驼峰格式的类名
        const nameMatches = templateContent.match(ScriptNameChecker.classNameFormatReg);
        const classNameStringFormat = nameMatches && nameMatches[1] ? nameMatches[1] : '';
        return new ScriptNameChecker(ScriptNameChecker.camelFormatReg.test(templateContent), classNameStringFormat);
    }
}
const DefaultClassName = 'NewComponent';

export const DefaultScriptFileNameCheckConfig: FileNameCheckConfig = {
    regStr: ScriptNameChecker.invalidClassNameReg.toString(),
    failedType: 'info',
    failedInfo: 'i18n:engine-extends.importers.script.invalidClassName',
};
