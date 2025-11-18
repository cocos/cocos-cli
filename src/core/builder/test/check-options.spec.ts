import { globalSetup } from '../../test/global-setup';
import { checkStartScene } from '../share/common-options-validator';

describe('check-options', () => {
    beforeAll(async () => {
        await globalSetup();
    });
    
    describe('check-start-scene', () => {
        it('check-start-scene by uuid', () => {
            const startScene = 'f895c111-fd50-4ed6-b07c-f514972cfbd1';
            const result = checkStartScene(startScene);
            expect(result).toBe(true);
        });
        it('check-start-scene by url', async () => {
            const startScene = 'db://assets/scene-2d.scene';
            const result = checkStartScene(startScene);
            expect(result).toBe(true);
        });
        it('check-start-scene by invalid uuid', () => {
            const startScene = '123';
            const result = checkStartScene(startScene);
            expect(result).toBeInstanceOf(Error);
        });
        it('check-start-scene by invalid url', () => {
            const startScene = 'db://assets/scene-2d.scene1';
            const result = checkStartScene(startScene);
            expect(result).toBeInstanceOf(Error);
        });
    });
});