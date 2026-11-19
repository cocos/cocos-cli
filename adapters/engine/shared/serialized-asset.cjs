const fs = require('node:fs');
const path = require('node:path');

// CLI CCON artifacts use .bin on disk; engines request the .cconb transport suffix.
// Only flat UUID assets with a complete CCON v1 envelope can use this alias.
function resolveSerializedAssetFile(requestedFile) {
    const name = path.basename(requestedFile);
    const match = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:@[0-9a-f]+)?\.cconb$/i.exec(name);
    if (!match || path.basename(path.dirname(requestedFile)).toLowerCase() !== match[1].slice(0, 2).toLowerCase()) return undefined;
    const candidate = requestedFile.slice(0, -6) + '.bin';
    let descriptor;
    try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile() || stat.size < 16) return undefined;
        descriptor = fs.openSync(candidate, 'r');
        const header = Buffer.alloc(16);
        if (fs.readSync(descriptor, header, 0, 16, 0) !== 16 || header.readUInt32LE(0) !== 0x4e4f4343
            || header.readUInt32LE(4) !== 1 || header.readUInt32LE(8) !== stat.size
            || header.readUInt32LE(12) > stat.size - 16) return undefined;
        return candidate;
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
        throw error;
    } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
module.exports = { resolveSerializedAssetFile };
