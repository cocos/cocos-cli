const mockSetWebTransport = jest.fn();
const mockAttach = jest.fn();
const mockDispose = jest.fn();
const mockRegister = jest.fn();

jest.mock('../process-rpc', () => ({
    ProcessRPC: jest.fn().mockImplementation(() => ({
        setWebTransport: mockSetWebTransport,
        attach: mockAttach,
        dispose: mockDispose,
        register: mockRegister,
    })),
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: {},
}));

import { RpcProxy } from '../scene-process/rpc';

describe('RpcProxy Web transport state', () => {
    beforeEach(() => {
        mockSetWebTransport.mockReset();
        mockAttach.mockReset();
        mockDispose.mockReset();
        mockRegister.mockReset();
    });

    it('exposes a server URL only when it initialized Web RPC', async () => {
        const proxy = new RpcProxy();

        await proxy.startup({ serverURL: 'http://localhost:7456' });

        expect(proxy.getWebServerUrl()).toBe('http://localhost:7456');
        expect(mockSetWebTransport).toHaveBeenCalledWith('http://localhost:7456');

        proxy.dispose();
        expect(proxy.getWebServerUrl()).toBeUndefined();
    });

    it('does not treat an IPC Scene worker as Web RPC', async () => {
        const proxy = new RpcProxy();

        await proxy.startup();

        expect(proxy.getWebServerUrl()).toBeUndefined();
        expect(mockAttach).toHaveBeenCalledWith(process);
    });
});
