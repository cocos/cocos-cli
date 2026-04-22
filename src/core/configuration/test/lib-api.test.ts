jest.mock('../index', () => ({
    configurationManager: {
        getConfigPath: jest.fn(),
    },
}));

describe('configuration lib api', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('should delegate getConfigPath to configurationManager', async () => {
        const { configurationManager } = require('../index') as typeof import('../index');
        configurationManager.getConfigPath = jest.fn().mockResolvedValue('/test/project/cocos.config.json');

        const { getConfigPath } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');

        await expect(getConfigPath()).resolves.toBe('/test/project/cocos.config.json');
        expect(configurationManager.getConfigPath).toHaveBeenCalledTimes(1);
    });
});
