import { BuilderHook } from '../../../mcp/hooks/builder.hook';

describe('BuilderHook builder-build options', () => {
    it('preserves support platform packages for dynamic parent platforms', () => {
        const args = {
            platform: 'openpaas',
            options: {
                platform: 'openpaas',
                packages: {
                    openpaas: {
                        enableWebBuild: true,
                        appid: '2044612991434805250',
                    },
                    'web-desktop': {
                        bridgeLink: 'https://example.com/desktop-bridge.js',
                        bridgeBuildToken: 'desktop-token',
                    },
                    'web-mobile': {
                        bridgeLink: 'https://example.com/mobile-bridge.js',
                        bridgeBuildToken: 'mobile-token',
                    },
                },
            },
        };

        new BuilderHook().onBeforeExecute('builder-build', args);

        expect(args.options.packages).toMatchObject({
            openpaas: {
                enableWebBuild: true,
                appid: '2044612991434805250',
            },
            'web-desktop': {
                bridgeLink: 'https://example.com/desktop-bridge.js',
                bridgeBuildToken: 'desktop-token',
            },
            'web-mobile': {
                bridgeLink: 'https://example.com/mobile-bridge.js',
                bridgeBuildToken: 'mobile-token',
            },
        });
    });
});
