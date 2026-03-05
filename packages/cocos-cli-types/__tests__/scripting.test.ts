import { init } from '../scripting';

describe('cocos-cli-types: scripting', () => {
    it('should be able to import init', () => {
        const _init: typeof init = init;
        expect(1).toBe(1);
    });
});
