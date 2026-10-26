import { networkInterfaces } from 'os';
import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';

/**
 * The server exposes MCP tools and project APIs with no authentication, so any web page the
 * user visits could otherwise drive it: a cross-origin fetch to http://localhost:<port>, or a
 * DNS-rebinding domain that resolves to 127.0.0.1. Requests are therefore only accepted when
 *  - the Host header names this machine (blocks DNS rebinding), and
 *  - the Origin header, if present, is this machine or a PinK/VS Code webview.
 * Non-browser clients (MCP clients, CLI, curl) send no Origin and are unaffected.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const WEBVIEW_PROTOCOLS = new Set(['vscode-webview:', 'vscode-file:']);

export interface RequestGuardConfig {
    /** Host the server was started with (e.g. a LAN IP for device preview). */
    configuredHost?: string;
}

function stripBrackets(hostname: string): string {
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isLoopbackHostname(hostname: string): boolean {
    const h = stripBrackets(hostname.toLowerCase());
    return LOOPBACK_HOSTNAMES.has(h) || /^127(\.\d{1,3}){3}$/.test(h);
}

function isLocalInterfaceAddress(hostname: string): boolean {
    const h = stripBrackets(hostname.toLowerCase());
    for (const addresses of Object.values(networkInterfaces())) {
        for (const info of addresses ?? []) {
            if (info.address.toLowerCase() === h) {
                return true;
            }
        }
    }
    return false;
}

function isTrustedHostname(hostname: string, config: RequestGuardConfig): boolean {
    if (!hostname) {
        return false;
    }
    if (isLoopbackHostname(hostname)) {
        return true;
    }
    const configured = config.configuredHost?.toLowerCase();
    if (configured && stripBrackets(hostname.toLowerCase()) === stripBrackets(configured)) {
        return true;
    }
    // A DNS-rebinding attacker controls a domain name, not one of our interface IPs, so
    // accepting literal local IPs keeps LAN device preview working without reopening the hole.
    return isLocalInterfaceAddress(hostname);
}

/** Hostname part of a Host header value ("example.com:9527", "[::1]:9527"). */
function hostnameOfHostHeader(hostHeader: string): string {
    try {
        return new URL(`http://${hostHeader}`).hostname;
    } catch {
        return '';
    }
}

export function isAllowedHostHeader(hostHeader: string | undefined, config: RequestGuardConfig = {}): boolean {
    if (!hostHeader) {
        return false;
    }
    return isTrustedHostname(hostnameOfHostHeader(hostHeader), config);
}

export function isAllowedOrigin(origin: string | undefined, config: RequestGuardConfig = {}): boolean {
    if (origin === undefined) {
        return true;
    }
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        // Includes the opaque "null" origin sent by sandboxed iframes and file:// pages.
        return false;
    }
    if (WEBVIEW_PROTOCOLS.has(url.protocol)) {
        return true;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
    }
    return isTrustedHostname(url.hostname, config);
}

/** Shared check for express and socket.io; returns a reason when the request must be rejected. */
export function rejectReason(req: IncomingMessage, config: RequestGuardConfig = {}): string | undefined {
    if (!isAllowedHostHeader(req.headers.host, config)) {
        return 'Host not allowed';
    }
    const origin = req.headers.origin;
    if (!isAllowedOrigin(typeof origin === 'string' ? origin : undefined, config)) {
        return 'Origin not allowed';
    }
    return undefined;
}

export function createRequestGuard(getConfig: () => RequestGuardConfig) {
    return function requestGuard(req: Request, res: Response, next: NextFunction) {
        const reason = rejectReason(req, getConfig());
        if (reason) {
            res.status(403).type('text').send(`403 - ${reason}`);
            return;
        }
        next();
    };
}
