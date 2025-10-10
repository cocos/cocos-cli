import { existsSync } from 'fs';
import { IInternalVerificationRule, IVerificationRuleMap, IVerificationRule } from '../@types';
import Utils from '../../base/utils';

export class Validator {
    private static internalVerifyRules: Record<string, IInternalVerificationRule> = {
        pathExist: {
            func: (path: string) => {
                if (typeof path !== 'string') {
                    return false;
                }
                path = Utils.Path.resolveToRaw(path);
                return existsSync(path);
            },
            message: 'i18n:builder.warn.path_not_exist',
        },
        valid: {
            func: (value: any) => {
                return value !== null && value !== undefined;
            },
            message: 'i18n:builder.verify_rule_message.valid',
        },
        required: {
            func: (value: any) => {
                return value !== null && value !== undefined && value !== '';
            },
            message: 'i18n:builder.verify_rule_message.required',
        },
        normalName: {
            func: (value: any) => {
                return /^[a-zA-Z0-9_-]*$/.test(value);
            },
            message: 'i18n:builder.verify_rule_message.normalName',
        },
        noChinese: {
            func: (value: any) => {
                return !/.*[\u4e00-\u9fa5]+.*$/.test(value);
            },
            message: 'i18n:builder.verify_rule_message.no_chinese',
        },
        array: {
            func: (value: any) => {
                return Array.isArray(value);
            },
            message: 'i18n:builder.verify_rule_message.array',
        },
        string: {
            func: (value: any) => {
                return typeof value === 'string';
            },
            message: 'i18n:builder.verify_rule_message.string',
        },
        number: {
            func: (value: any) => {
                return typeof value === 'number';
            },
            message: 'i18n:builder.verify_rule_message.number',
        },
        http: {
            func: (value: string) => {
                if (typeof value !== 'string') {
                    return false;
                }
                return value.startsWith('http');
            },
            message: 'i18n:builder.verify_rule_message.http',
        },
        // 不允许任何非法字符的路径
        strictPath: {
            func: () => {
                return false;
            },
            message: 'i18n:builder.verify_rule_message.strict_path',
        },
        normalPath: {
            func: (value?: string) => {
                if (typeof value !== 'string') {
                    return false;
                }
                return /^[a-zA-Z]:[\\]((?! )(?![^\\/]*\s+[\\/])[\w -]+[\\/])*(?! )(?![^.]*\s+\.)[\w -]+$/.test(value);
            },
            message: 'i18n:builder.verify_rule_message.normal_path',
        },
    };

    public static addRule(ruleName: string, rule: IInternalVerificationRule) {
        if (Validator.internalVerifyRules[ruleName]) {
            return;
        }
        Validator.internalVerifyRules[ruleName] = rule;
    }

    private customVerifyRules: IVerificationRuleMap = {};

    public has(ruleName: string) {
        const checkValitor = this.customVerifyRules[ruleName] || Validator.internalVerifyRules[ruleName];
        if (!checkValitor || !checkValitor.func) {
            return false;
        }
        return true;
    }

    public queryRuleMessage(ruleName: string): string {
        const checkValitor = this.customVerifyRules[ruleName] || Validator.internalVerifyRules[ruleName];
        return checkValitor && checkValitor.message;
    }

    public checkWithInternalRule(ruleName: string, value: any, ...arg: any[]) {
        const checkValitor = Validator.internalVerifyRules[ruleName];
        if (!checkValitor || !checkValitor.func) {
            console.warn(`Invalid check with ${value}: Rule ${ruleName} is not exist.`);
            return false;
        }
        return checkValitor.func(value, ...arg);
    }

    public async check(ruleName: string, value: any, ...arg: any[]): Promise<boolean> {
        return !(await this.checkRuleWithMessage(ruleName, value, ...arg));
    }

    public async checkRuleWithMessage(ruleName: string, value: any, ...arg: any[]): Promise<string> {
        const checkValitor = this.customVerifyRules[ruleName] || Validator.internalVerifyRules[ruleName];
        if (!checkValitor || !checkValitor.func) {
            return `Invalid check with ${value}: Rule ${ruleName} is not exist.`;
        }

        if (!await checkValitor.func(value, ...arg)) {
            // 添加规则时有判空处理，所以校验失败结果肯定不会是空字符串
            return checkValitor.message;
        }
        return '';
    }

    public add(ruleName: string, rule: IVerificationRule) {
        if (!rule || !rule.func || !rule.message) {
            // TODO 详细报错
            console.warn(`Add rule ${ruleName} failed!`);
            return;
        }
        this.customVerifyRules[ruleName] = rule;
    }
}
