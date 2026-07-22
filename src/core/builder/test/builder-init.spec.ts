const mockBuilderConfigInit = jest.fn(async () => undefined);
const mockPluginManagerInit = jest.fn(async () => undefined);
const mockRegister = jest.fn(async () => undefined);
const mockRegisterAllPlatform = jest.fn(async () => undefined);
const mockMiddlewareRegister = jest.fn();
const mockBuildMiddleware = {};

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        init: mockBuilderConfigInit,
    },
}));

jest.mock('../manager/plugin', () => ({
    pluginManager: {
        init: mockPluginManagerInit,
        register: mockRegister,
        registerAllPlatform: mockRegisterAllPlatform,
    },
}));

jest.mock('../../../server/middleware/core', () => ({
    middlewareService: {
        register: mockMiddlewareRegister,
    },
}));

jest.mock('../build.middleware', () => ({
    __esModule: true,
    default: mockBuildMiddleware,
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
    },
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        record: jest.fn(),
        createLogSinkRestorer: jest.fn(() => jest.fn()),
    },
}));

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {},
}));

import { init } from '../index';

describe('builder init', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registers every requested platform', async () => {
        await init(['web-desktop', 'android']);

        expect(mockBuilderConfigInit).toHaveBeenCalledTimes(1);
        expect(mockPluginManagerInit).toHaveBeenCalledTimes(1);
        expect(mockMiddlewareRegister).toHaveBeenCalledWith('Build', mockBuildMiddleware);
        expect(mockRegister).toHaveBeenNthCalledWith(1, 'web-desktop');
        expect(mockRegister).toHaveBeenNthCalledWith(2, 'android');
        expect(mockRegister).toHaveBeenCalledTimes(2);
        expect(mockRegisterAllPlatform).not.toHaveBeenCalled();
    });

    it.each<[string[] | undefined]>([[undefined], [[]]])('registers all platforms when platform list is %p', async (platforms) => {
        await init(platforms);

        expect(mockRegister).not.toHaveBeenCalled();
        expect(mockRegisterAllPlatform).toHaveBeenCalledTimes(1);
    });
});
