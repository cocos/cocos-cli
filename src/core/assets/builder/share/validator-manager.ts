import { IVerificationRule } from '../@types';
import { Validator } from './validator';

/**
 * 数据校验类
 */
class ValidatorManager {
    private validators: Record<string, Validator> = {};
    private defaultValidator = new Validator();

    /**
     * 添加校验规则
     * @param name
     * @param func
     * @param pkgName
     */
    addRule(name: string, rule: IVerificationRule, pkgName?: string) {
        let validator = this.defaultValidator;
        if (pkgName) {
            this.validators[pkgName] = this.validators[pkgName] || new Validator();
            validator = this.validators[pkgName];
        }
        validator.add(name, rule);
    }

    // TODO 后续可以设计走完所有校验的校验接口，可以在界面提示上优化，列出当前属性需要满足的条件里有哪些错误

    /**
     * 数据校验入口
     * @param value
     * @param rules
     * @param pkgName
     * @param options
     * @return 返回错误提示，数值正常则不报错
     */
    async check(value: any, rules: string[], options?: any, pkgName = ''): Promise<string> {
        if (!Array.isArray(rules)) {
            return '';
        }

        try {
            // 非必选参数空值时不做校验
            if (['', undefined, null].includes(value) && !rules.includes('required')) {
                return '';
            }
            for (const rule of rules) {
                const validator = this.validators[pkgName] || this.defaultValidator;
                if (!validator.has(rule)) {
                    console.warn(`Rule ${rule} is not exist.(pkgName: ${pkgName})`);
                    return '';
                }
                const err = await validator.checkRuleWithMessage(rule, value, options);
                if (err) {
                    return err;
                }
            }
        } catch (error: any) {
            return error.message;
        }
        return '';
    }
}

export const validator = new Validator();

export const validatorManager = new ValidatorManager();
