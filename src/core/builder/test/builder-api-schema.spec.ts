import { SchemaBuildOption } from '../../../api/builder/schema';

describe('Builder API build option schema', () => {
    it.each([
        [
            'web-desktop',
            {
                useWebGPU: false,
                resolution: {
                    designWidth: 1280,
                    designHeight: 960,
                },
            },
        ],
        [
            'web-mobile',
            {
                useWebGPU: false,
                orientation: 'auto',
                embedWebDebugger: false,
            },
        ],
    ])('preserves OpenPaaS runtime package fields for %s', (platform, platformOptions) => {
        const packageOptions = {
            ...platformOptions,
            appid: '2044612991434805250',
            versionName: '1.0.0',
            uploadEnv: 'dev',
            accessToken: 'access-token',
            codeVersion: '182',
            bridgeLink: 'https://example.com/bridge.js',
            bridgeBuildToken: 'bridge-build-token',
            entryPath: 'index.html',
            encryptKey: '00112233445566778899aabbccddeeff',
            extraHiddenField: 'future-hidden-value',
        };

        const parsed = SchemaBuildOption.parse({
            platform,
            packages: {
                [platform]: packageOptions,
            },
        }) as any;

        expect(parsed.packages[platform]).toMatchObject(packageOptions);
    });
});
