import { isAbsolute } from 'node:path';
import type Sharp from 'sharp';
import type Gl from 'gl';

/** Complete host modules: their JavaScript and native bindings must travel together. */
interface RuntimeProvider {
    version: 1;
    getGl(): typeof Gl;
    getSharp(): typeof Sharp;
}

const providerPath = process.env.COCOS_CLI_RUNTIME_PROVIDER;
let hostProvider: RuntimeProvider | undefined;

function getHostProvider(): RuntimeProvider | undefined {
    // Keep the local/legacy loader path until the provider migration is accepted.
    if (!providerPath) {
        return undefined;
    }
    if (!hostProvider) {
        if (!isAbsolute(providerPath)) {
            throw new Error('COCOS_CLI_RUNTIME_PROVIDER must be an absolute file path');
        }
        const candidate: Partial<RuntimeProvider> | null = require(providerPath);
        if (candidate?.version !== 1 || typeof candidate.getGl !== 'function' || typeof candidate.getSharp !== 'function') {
            throw new Error(`Invalid Cocos runtime provider: ${providerPath}`);
        }
        hostProvider = candidate as RuntimeProvider;
    }
    return hostProvider;
}

/** Load the host's complete gl package, or the CLI package when no host is configured. */
export function getGl(): typeof Gl {
    const provider = getHostProvider();
    return provider ? provider.getGl() : require('gl');
}

/** A configured provider is authoritative: loading errors must not fall back to local binaries. */
export function getSharp(): typeof Sharp {
    const provider = getHostProvider();
    return provider ? provider.getSharp() : require('sharp');
}
