import { SchemaBuildOption, SchemaSceneRef } from '../src/api/builder/schema';

describe('builder build schema', () => {
    it('accepts scene references by url or uuid', () => {
        expect(SchemaSceneRef.parse({
            url: 'db://assets/scenes/GameScene.scene',
        })).toEqual({
            url: 'db://assets/scenes/GameScene.scene',
        });

        expect(SchemaSceneRef.parse({
            uuid: '42e68f34-5f5f-4a8a-938a-ec9d5fe61b0d',
        })).toEqual({
            uuid: '42e68f34-5f5f-4a8a-938a-ec9d5fe61b0d',
        });
    });

    it('rejects scene references without url or uuid', () => {
        expect(SchemaSceneRef.safeParse({}).success).toBe(false);
    });

    it('accepts builder-build options with url-only scenes', () => {
        const result = SchemaBuildOption.parse({
            platform: 'web-desktop',
            scenes: [
                {
                    url: 'db://assets/scenes/GameScene.scene',
                },
            ],
            startScene: 'db://assets/scenes/GameScene.scene',
        });

        expect(result.scenes).toEqual([
            {
                url: 'db://assets/scenes/GameScene.scene',
            },
        ]);
    });
});
