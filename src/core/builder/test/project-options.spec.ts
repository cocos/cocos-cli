describe('project-options', () => {
    describe('getSplashSettings', () => {
        it('does not mutate splash screen config inputs', async () => {
            const { getSplashSettings } = await import('../worker/builder/tasks/setting-task/utils/project-options');
            const defaultSplashScreen = {
                totalTime: 1200,
                background: {
                    type: 'default',
                    image: 'db://internal/default-background.png',
                },
            } as any;
            const splashScreen = {
                logo: {
                    type: 'none',
                    image: 'db://assets/logo.png',
                },
            } as any;

            const result = await getSplashSettings(true, false, defaultSplashScreen, splashScreen);

            expect(result.logo).toEqual({ type: 'none' });
            expect(defaultSplashScreen).toEqual({
                totalTime: 1200,
                background: {
                    type: 'default',
                    image: 'db://internal/default-background.png',
                },
            });
            expect(splashScreen).toEqual({
                logo: {
                    type: 'none',
                    image: 'db://assets/logo.png',
                },
            });
        });

        it('does not mutate default splash screen config when disabled', async () => {
            const { getSplashSettings } = await import('../worker/builder/tasks/setting-task/utils/project-options');
            const defaultSplashScreen = {
                totalTime: 1200,
                background: {
                    type: 'default',
                    image: 'db://internal/default-background.png',
                },
            } as any;

            const result = await getSplashSettings(false, false, defaultSplashScreen, {} as any);

            expect(result.totalTime).toBe(0);
            expect(result.background).toBeUndefined();
            expect(defaultSplashScreen).toEqual({
                totalTime: 1200,
                background: {
                    type: 'default',
                    image: 'db://internal/default-background.png',
                },
            });
        });
    });

    describe('getPhysicsConfig', () => {
        it('does not mutate physics config input', async () => {
            const { getPhysicsConfig } = await import('../worker/builder/tasks/setting-task/utils/project-options');
            const physicsConfig = {
                defaultMaterial: 'material',
                gravity: { x: 0, y: -10, z: 0 },
            } as any;

            const result = await getPhysicsConfig(['physics-physx'], physicsConfig);

            result.gravity.y = -1;
            expect(result).toMatchObject({
                physicsEngine: 'physics-physx',
                defaultMaterial: 'material',
            });
            expect(physicsConfig).toEqual({
                defaultMaterial: 'material',
                gravity: { x: 0, y: -10, z: 0 },
            });
        });
    });
});
