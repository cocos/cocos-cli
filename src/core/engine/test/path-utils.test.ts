import {
    ILLEGAL_NAME_CHARS,
    sanitizeNodeName,
    validateNodeName,
} from '../editor-extends/manager/path-utils';

describe('node path utilities', () => {
    it.each(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])(
        'rejects and sanitizes the illegal node-name character %p',
        (character) => {
            const name = `A${character}B`;

            expect(validateNodeName(name)).toContain(`illegal character '${character}'`);
            expect(sanitizeNodeName(name)).toBe('A_B');
            expect(ILLEGAL_NAME_CHARS.test(name)).toBe(true);
        },
    );

    it('preserves legal display names, including duplicate-name suffix text', () => {
        expect(validateNodeName('Enemy_001')).toBeNull();
        expect(sanitizeNodeName('Enemy_001')).toBe('Enemy_001');
    });
});
