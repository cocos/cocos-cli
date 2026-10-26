import { compareVersion } from '../utils/parse';

describe('parse.compareVersion', () => {
    it('compares versions segment by segment', () => {
        expect(compareVersion('1.0.10', '1.0.2')).toBeGreaterThan(0);
        expect(compareVersion('14.10', '14.3')).toBeGreaterThan(0);
        expect(compareVersion('1.0.0.2', '1.0.0.3')).toBeLessThan(0);
        expect(compareVersion('14.3', '14.3.0')).toBe(0);
    });

    it('throws when params are not strings', () => {
        expect(() => compareVersion(null as unknown as string, '1.0.0')).toThrow('invalid param');
    });
});
