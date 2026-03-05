import { init } from '../base';

describe('cocos-cli-types: base', () => {
    it('should be able to import init', () => {
        const _init: typeof init = init;
        expect(1).toBe(1);
    });
});
