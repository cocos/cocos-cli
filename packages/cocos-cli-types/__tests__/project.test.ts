import { init, open, close } from '../project';

describe('cocos-cli-types: project', () => {
    it('should be able to import api functions', () => {
        const _init: typeof init = init;
        const _open: typeof open = open;
        const _close: typeof close = close;

        expect(1).toBe(1);
    });
});
