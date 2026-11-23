import { Engine } from '../engine';
import { getPlatformBuildSchema, queryDefaultBuildConfigByPlatform, checkBuildOptions } from './index';
import type { IBuildTaskOption, Platform } from './@types/private';

/** Query the selected engine's module catalog without changing project settings. */
export function queryEngineModules() {
    const config = Engine.queryModuleConfig();
    if (!Object.keys(config.features).length) {
        throw new Error('Engine module configuration is unavailable; initialize the engine first.');
    }
    return JSON.parse(JSON.stringify({
        modules: Object.entries(config.features).filter(([, feature]) => !('options' in feature)).map(([id, feature]) => ({
            ...feature,
            id,
            dependencies: config.moduleDependMap[id] || [],
            environment: config.envLimitModule[id],
        })),
        selectedModules: Engine.getModules(),
    })) as { modules: Array<{ id: string; dependencies: string[]; [key: string]: unknown }>; selectedModules: string[] };
}

/** Validate a partial configuration using the same platform rules as the builder. */
export async function validateBuildConfig(platform: string, options: Record<string, unknown>) {
    // Reject unknown platforms before evaluating their defaults or validation hooks.
    getPlatformBuildSchema(platform);
    const defaults = await queryDefaultBuildConfigByPlatform(platform as Platform);
    const packages = options.packages as Record<string, Record<string, unknown>> | undefined;
    if (options.packages !== undefined && (!packages || typeof packages !== 'object' || Array.isArray(packages))) {
        throw new Error('packages must be an object.');
    }
    const candidate = {
        ...defaults, ...JSON.parse(JSON.stringify(options)), platform,
        packages: {
            ...defaults.packages, ...JSON.parse(JSON.stringify(packages || {})),
            [platform]: { ...defaults.packages?.[platform as Platform], ...JSON.parse(JSON.stringify(packages?.[platform] || {})) },
        },
    } as IBuildTaskOption;
    const errors: { code: string; path: string; message: string }[] = [];
    const warnings: { code: string; path: string; message: string }[] = [];
    if (options.platform !== undefined && options.platform !== platform) {
        errors.push({ code: 'PLATFORM_MISMATCH', path: 'platform', message: 'The configuration platform must match the requested platform.' });
    }
    if (options.includeModules !== undefined) {
        if (!Array.isArray(options.includeModules) || options.includeModules.some(id => typeof id !== 'string')) {
            errors.push({ code: 'INVALID_ENGINE_MODULES', path: 'includeModules', message: 'includeModules must be an array of module identifiers.' });
        } else {
            const known = new Set(queryEngineModules().modules.map((module: { id: string }) => module.id));
            options.includeModules.forEach((id, index) => {
                if (!known.has(id)) errors.push({ code: 'UNKNOWN_ENGINE_MODULE', path: 'includeModules[' + index + ']', message: 'Unknown engine module: ' + id });
            });
        }
    }
    // Avoid invoking platform hooks with malformed module arrays.
    if (errors.length) return { valid: false, errors, warnings, checks: {} };
    const checks = await checkBuildOptions(platform, candidate);
    for (const [key, check] of Object.entries(checks)) {
        if (!check.valid) {
            const issue = { code: 'INVALID_BUILD_OPTION', path: key, message: check.message || 'Invalid build option.' };
            (check.level === 'warn' ? warnings : errors).push(issue);
        }
    }
    return { valid: errors.length === 0, errors, warnings, checks };
}
