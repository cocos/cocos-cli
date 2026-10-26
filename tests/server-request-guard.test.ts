import type { IncomingMessage } from 'http';
import { isAllowedHostHeader, isAllowedOrigin, rejectReason } from '../src/server/utils/request-guard';

function req(headers: Record<string, string>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
}

describe('server request guard', () => {
    describe('Host header', () => {
        it.each([
            'localhost:9527',
            '127.0.0.1:9527',
            '[::1]:9527',
            '127.0.0.2:9527',
        ])('accepts loopback host %s', (host) => {
            expect(isAllowedHostHeader(host)).toBe(true);
        });

        it('accepts the host the server was configured with', () => {
            expect(isAllowedHostHeader('preview.lan:9527', { configuredHost: 'preview.lan' })).toBe(true);
        });

        it.each([
            'attacker.example:9527',
            'localhost.attacker.example:9527',
            '',
        ])('rejects DNS-rebinding style host %p', (host) => {
            expect(isAllowedHostHeader(host)).toBe(false);
        });

        it('rejects a missing Host header', () => {
            expect(isAllowedHostHeader(undefined)).toBe(false);
        });
    });

    describe('Origin header', () => {
        it('accepts requests without Origin (MCP clients, CLI, curl)', () => {
            expect(isAllowedOrigin(undefined)).toBe(true);
        });

        it.each([
            'http://localhost:9527',
            'http://127.0.0.1:9527',
            'http://[::1]:9527',
            'vscode-webview://1abc2def',
            'vscode-file://vscode-app',
        ])('accepts local or webview origin %s', (origin) => {
            expect(isAllowedOrigin(origin)).toBe(true);
        });

        it.each([
            'https://evil.example',
            'http://localhost.evil.example',
            'null',
            'file://',
            'chrome-extension://abcdef',
        ])('rejects foreign origin %s', (origin) => {
            expect(isAllowedOrigin(origin)).toBe(false);
        });
    });

    describe('rejectReason', () => {
        it('lets a plain MCP client through', () => {
            expect(rejectReason(req({ host: 'localhost:9527' }))).toBeUndefined();
        });

        it('blocks a cross-origin page hitting localhost', () => {
            expect(rejectReason(req({ host: 'localhost:9527', origin: 'https://evil.example' }))).toBe('Origin not allowed');
        });

        it('blocks DNS rebinding even when the page looks same-origin', () => {
            expect(rejectReason(req({ host: 'attacker.example:9527', origin: 'http://attacker.example:9527' }))).toBe('Host not allowed');
        });
    });
});
