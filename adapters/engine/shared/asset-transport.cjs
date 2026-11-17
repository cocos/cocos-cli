'use strict';
// CLI's flat asset routes serve paths to Node adapters and bytes to browser PALs.
// The legacy backend uses the HTML5 PAL, so request bytes explicitly rather than
// allowing xhr2 to JSON-parse a returned filesystem path.
function byteResponseURL(value) {
    if (typeof value !== 'string') return value;
    try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            && /^\/[a-f0-9]{2}\/[^/]+/i.test(url.pathname)) {
            url.searchParams.set('isBrowser', 'true');
            return url.href;
        }
    } catch { /* Preserve local paths and relative URLs. */ }
    return value;
}
function createXMLHttpRequest(Base) {
    return class LegacyXMLHttpRequest extends Base {
        open(method, url, ...args) { return super.open(method, byteResponseURL(url), ...args); }
        // xhr2 does not implement blob. Preserve the original bytes before the
        // DONE/readystatechange/load callbacks, including non-UTF8 media data.
        _parseResponse() {
            const blob = this.responseType === 'blob';
            if (blob) this.responseType = 'buffer';
            try { super._parseResponse(); }
            finally { if (blob) this.responseType = 'blob'; }
            if (blob) this.response = new Blob([this.response], { type: this.getResponseHeader('content-type') || '' });
        }
    };
}
module.exports = { byteResponseURL, createXMLHttpRequest };
