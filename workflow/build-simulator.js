const fs = require('fs-extra');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const defaultEngineDir = path.join(rootDir, 'packages', 'engine');

const platformArtifacts = {
    darwin: {
        bundle: 'SimulatorApp-Mac.app',
        entry: 'SimulatorApp-Mac.app/Contents/MacOS/SimulatorApp-Mac',
    },
    win32: {
        bundle: 'SimulatorApp-Win32.exe',
        entry: 'SimulatorApp-Win32.exe',
    },
};

function getHostArtifact() {
    const artifact = platformArtifacts[process.platform];
    if (!artifact) {
        throw new Error(`Simulator build is not supported on host platform: ${process.platform}`);
    }
    return artifact;
}

function parseCliEnginePath(argv = process.argv.slice(2)) {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--enginePath') {
            return argv[i + 1];
        }
        if (arg.startsWith('--enginePath=')) {
            return arg.slice('--enginePath='.length);
        }
    }
    return undefined;
}

function resolveEngineDir(enginePath) {
    return path.resolve(enginePath || defaultEngineDir);
}

function getSimulatorReleaseDir(enginePath) {
    return path.join(resolveEngineDir(enginePath), 'native', 'simulator', 'Release');
}

function getSimulatorExecutablePath(enginePath) {
    const artifact = getHostArtifact();
    return path.join(getSimulatorReleaseDir(enginePath), artifact.entry);
}

async function prependBundledCmakeToPath() {
    const executable = process.platform === 'win32' ? 'cmake.exe' : 'cmake';
    const bundledCmake = path.join(rootDir, 'static', 'tools', 'cmake', 'bin', executable);
    if (!await fs.pathExists(bundledCmake)) {
        return undefined;
    }

    const cmakeBinDir = path.dirname(bundledCmake);
    const currentPath = process.env.PATH || '';
    const pathEntries = currentPath.split(path.delimiter).filter(Boolean);
    if (pathEntries.includes(cmakeBinDir)) {
        return bundledCmake;
    }

    process.env.PATH = [cmakeBinDir, ...pathEntries].join(path.delimiter);
    return bundledCmake;
}

async function buildNativeSimulator(enginePath) {
    if (process.env.SKIP_SIMULATOR_BUILD === '1') {
        console.log('Skip native simulator build because SKIP_SIMULATOR_BUILD=1');
        return;
    }

    const engineDir = resolveEngineDir(enginePath);
    const nativeDir = path.join(engineDir, 'native');
    const gulpfilePath = path.join(nativeDir, 'gulpfile.js');
    if (!await fs.pathExists(gulpfilePath)) {
        throw new Error(`Engine native gulpfile not found: ${gulpfilePath}`);
    }

    const bundledCmake = await prependBundledCmakeToPath();
    if (bundledCmake) {
        console.log(`Using bundled cmake from: ${bundledCmake}`);
    }

    console.log(`Building native simulator executable with engine native gulp task: ${engineDir}`);
    const engineGulp = require(require.resolve('gulp', { paths: [engineDir] }));
    require(gulpfilePath);
    const previousCwd = process.cwd();
    process.chdir(nativeDir);
    try {
        await new Promise((resolvePromise, reject) => {
            engineGulp.series('gen-simulator-release')((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolvePromise();
            });
        });
    } finally {
        process.chdir(previousCwd);
    }

    const releaseDir = getSimulatorReleaseDir(engineDir);
    if (!await fs.pathExists(releaseDir)) {
        throw new Error(`Simulator release output not found: ${releaseDir}`);
    }

    const executablePath = getSimulatorExecutablePath(engineDir);
    if (!await fs.pathExists(executablePath)) {
        throw new Error(`Simulator entry artifact not found: ${executablePath}`);
    }

    console.log(`Native simulator executable prepared at: ${executablePath}`);
}

if (require.main === module) {
    buildNativeSimulator(parseCliEnginePath()).catch((error) => {
        console.error('[build-simulator] failed:', error);
        process.exit(1);
    });
}

module.exports = {
    buildNativeSimulator,
    buildSimulatorArtifacts: buildNativeSimulator,
    getSimulatorExecutablePath,
    getSimulatorReleaseDir,
    parseCliEnginePath,
    platformArtifacts,
    resolveEngineDir,
};
