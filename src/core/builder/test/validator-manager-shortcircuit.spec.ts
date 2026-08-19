import { validatorManager } from '../share/validator-manager';

describe('validatorManager.check short-circuit', () => {
    const pkg = 'test-shortcircuit';

    beforeAll(() => {
        validatorManager.addRule('formatCheck', {
            func: (value: string) => /^ok/.test(String(value)),
            message: 'bad format',
        }, pkg);
        validatorManager.addRule('mustNotBeEmpty', {
            func: (value: unknown) => value !== '' && value !== null && value !== undefined,
            message: 'must not be empty',
        }, pkg);
        // 命名以 Required 结尾——按新约定应该绕开空值 short-circuit
        validatorManager.addRule('customRequired', {
            func: (value: unknown) => value !== '' && value !== null && value !== undefined,
            message: 'custom required',
        }, pkg);
        // 条件必填：只在 flag=false 时要求非空
        validatorManager.addRule('conditionalRequired', {
            func: (value: unknown, options: any) => {
                if (options?.useDebug) {
                    return true;
                }
                return value !== '' && value !== null && value !== undefined;
            },
            message: 'conditional required',
        }, pkg);
    });

    describe('空值 short-circuit（旧行为，保留）', () => {
        it('空值 + 普通规则 → 直接跳过（不 fire）', async () => {
            const err = await validatorManager.check('', ['formatCheck'], {}, pkg);
            expect(err).toBe('');
        });

        it('空值 + rules 含字面量 required → 不 short-circuit（fire 内置 required）', async () => {
            const err = await validatorManager.check('', ['required'], {}, pkg);
            expect(err).toBeTruthy();
        });

        it('非空值 + 普通规则 → 正常校验', async () => {
            const bad = await validatorManager.check('bad', ['formatCheck'], {}, pkg);
            expect(bad).toBe('bad format');
            const ok = await validatorManager.check('ok!', ['formatCheck'], {}, pkg);
            expect(ok).toBe('');
        });
    });

    describe('*Required 命名约定（新增）', () => {
        it('空值 + 以 Required 结尾的自定义规则 → 绕过 short-circuit，规则被执行', async () => {
            const err = await validatorManager.check('', ['customRequired'], {}, pkg);
            expect(err).toBe('custom required');
        });

        it('非空值 + 以 Required 结尾的规则 → 正常通过', async () => {
            const err = await validatorManager.check('value', ['customRequired'], {}, pkg);
            expect(err).toBe('');
        });

        it('条件必填：flag=true 时空值也通过', async () => {
            const err = await validatorManager.check('', ['conditionalRequired'], { useDebug: true }, pkg);
            expect(err).toBe('');
        });

        it('条件必填：flag=false 时空值应该报错', async () => {
            const err = await validatorManager.check('', ['conditionalRequired'], { useDebug: false }, pkg);
            expect(err).toBe('conditional required');
        });

        it('规则名中间含 Required 但不是结尾 → 仍然 short-circuit', async () => {
            validatorManager.addRule('RequiredButMiddle', {
                func: () => false,
                message: 'should not fire',
            }, pkg);
            const err = await validatorManager.check('', ['RequiredButMiddle'], {}, pkg);
            // 结尾不是 Required（结尾是 Middle），维持旧的 short-circuit 语义
            expect(err).toBe('');
        });
    });
});
