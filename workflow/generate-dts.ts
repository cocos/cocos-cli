
import * as path from 'path';
import * as fs from 'fs-extra';
import {
    Extractor,
    ExtractorConfig,
    ExtractorResult,
    IConfigFile,
    ExtractorLogLevel
} from '@microsoft/api-extractor';
import { Modularize } from '@cocos/ccbuild';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);// Dynamically build the real PlatformType union from @cocos/ccbuild enums.
// This is needed because api-extractor incorrectly resolves

// -------------------------------------------------------------------
// Version counter utilities for DTS package publishing
// -------------------------------------------------------------------

async function fetchNextVersionCounter(rootVersion: string): Promise<number> {
    try {
        const { stdout } = await execAsync('npm view @cocos/cocos-cli-types versions --json');
        const versions: string[] = JSON.parse(stdout);
        
        // Find versions that start with the rootVersion 
        // Example: if rootVersion is "0.0.1-alpha.15", we look for "0.0.1-alpha.15.1", "0.0.1-alpha.15.2", etc.
        const prefix = `${rootVersion}.`;
        const matchingVersions = versions.filter(v => v.startsWith(prefix));

        if (matchingVersions.length === 0) {
            return 1;
        }

        // Extract the suffixes and find the maximum numeric value
        const suffixes = matchingVersions.map(v => {
            const suffixStr = v.substring(prefix.length);
            const num = parseInt(suffixStr, 10);
            return isNaN(num) ? 0 : num;
        });

        const maxSuffix = Math.max(...suffixes);
        return maxSuffix + 1;
    } catch (e) {
        // If the package doesn't exist yet or command fails, start from 1
        console.warn(`Could not fetch versions from NPM. Defaulting counter to 1. Error: ${(e as Error).message}`);
        return 1;
    }
}

function composeVersion(root: string, counter: number): string {
  return `${root}.${counter}`;
}

// -------------------------------------------------------------------


// `type PlatformType = _PlatformType` into `type PlatformType = PlatformType`
// (circular self-reference) when bundling the .d.ts files.
function buildPlatformTypeUnion(): string {
    const allKeys = [
        ...Object.keys(Modularize.WebPlatform).filter(k => isNaN(Number(k))),
        ...Object.keys(Modularize.MinigamePlatform).filter(k => isNaN(Number(k))),
        ...Object.keys(Modularize.NativePlatform).filter(k => isNaN(Number(k))),
    ].map(k => k.toUpperCase());
    const extras = ['HTML5', 'NATIVE', 'NODEJS', 'INVALID_PLATFORM'];
    const allTypes = [...new Set([...allKeys, ...extras])];
    return allTypes.map(t => `'${t}'`).join(' | ');
}

async function postProcessDts(filePath: string) {
    let content = await fs.readFile(filePath, 'utf-8');
    const selfRef = 'type PlatformType = PlatformType;';
    if (!content.includes(selfRef)) return;

    const platformTypeUnion = buildPlatformTypeUnion();
    content = content.replace(
        new RegExp(selfRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        `type PlatformType = ${platformTypeUnion};`
    );
    // Remove leftover eslint-disable-next-line @typescript-eslint/ban-types comments
    // These come from dependencies like @cocos/ccbuild but trigger errors in the new ESLint config
    // We add `[ \t]*` to catch any indentation the comment might have
    const banTypesComment = /[ \t]*\/\/ eslint-disable-next-line @typescript-eslint\/ban-types\r?\n/g;
    if (content.match(banTypesComment)) {
        content = content.replace(banTypesComment, '');
        console.log(`  Post-processed: removed @typescript-eslint/ban-types comments in ${path.basename(filePath)}`);
    }

    await fs.writeFile(filePath, content, 'utf-8');
}

const projectRoot = path.resolve(__dirname, '..');
const dtsExportRoot = path.join(projectRoot, 'packages/cocos-cli-types');
interface IDtsEntry {
    name: string;
    source: string; // Relative to project root, e.g. src/core/builder/@types/protected.ts
    output: string; // Relative to project root or file root, e.g. @types/cocos-cli/builder-plugins
}

// Define your entries here
const entries: IDtsEntry[] = [
    {
        name: 'lib',
        source: 'src/lib/index.ts',
        output: 'index.d.ts'
    }, {
        name: 'assets',
        source: 'src/lib/assets/assets.ts',
        output: 'assets.d.ts'
    }, {
        name: 'base',
        source: 'src/lib/base/base.ts',
        output: 'base.d.ts'
    }, {
        name: 'configuration',
        source: 'src/lib/configuration/configuration.ts',
        output: 'configuration.d.ts'
    }, {
        name: 'engine',
        source: 'src/lib/engine/engine.ts',
        output: 'engine.d.ts'
    }, {
        name: 'project',
        source: 'src/lib/project/project.ts',
        output: 'project.d.ts'
    }, {
        name: 'scripting',
        source: 'src/lib/scripting/scripting.ts',
        output: 'scripting.d.ts'
    }, {
        name: 'builder',
        source: 'src/lib/builder/builder.ts',
        output: 'builder.d.ts'
    }
];

const packageJSON = {
    name: '@cocos/cocos-cli-types',
    description: 'types for cocos cli',
    author: 'cocos cli',
    version: '0.0.1-alpha.5',
    main: 'index.d.ts',
    types: 'index.d.ts',
    files: [
        '*.d.ts',
    ]
};

async function generate() {
    console.log(`Starting DTS generation for ${entries.length} entries...`);

    for (const entry of entries) {
        console.log(`\nProcessing ${entry.name}...`);

        // Convert source path to dist path
        // Assuming src/ matches dist/ structure and .ts -> .d.ts
        // We need to handle the fact that 'src' might be mapped to 'dist' in tsconfig
        // For this project, rootDir is ./src and outDir is ./dist

        const relativeSource = path.relative(path.join(projectRoot, 'src'), path.join(projectRoot, entry.source));
        if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
            throw new Error(`Source ${entry.source} must be inside src/ directory`);
        }

        const distPath = path.join(projectRoot, 'dist', relativeSource.replace(/\.ts$/, '.d.ts'));

        if (!fs.existsSync(distPath)) {
            console.error(`Entry file not found: ${distPath}`);
            console.error(`Please ensure you have run the build script (e.g. 'npm run build') to generate the dist files.`);
            process.exit(1);
        }

        const output = path.join(dtsExportRoot, entry.output);

        // Create a temporary api-extractor config object
        const configObject: IConfigFile = {
            projectFolder: projectRoot,
            mainEntryPointFilePath: distPath,
            compiler: {
                tsconfigFilePath: path.join(projectRoot, 'tsconfig.json'),
                skipLibCheck: false,
            },
            dtsRollup: {
                enabled: true,
                untrimmedFilePath: output
                // publicTrimmedFilePath: path.join(outputDir, 'public.d.ts') // Optional: if we want a public vs beta split
            },
            bundledPackages: ['@cocos/asset-db', '@cocos/ccbuild', 'rollup', '@babel', '@babel/core', '@babel', 'workflow-extra', '@cocos/lib-programming'],
            docModel: {
                enabled: false
            },
            tsdocMetadata: {
                enabled: false
            },
            messages: {
                compilerMessageReporting: {
                    default: {
                        logLevel: ExtractorLogLevel.Warning
                    }
                },
                extractorMessageReporting: {
                    default: {
                        logLevel: ExtractorLogLevel.Warning,
                        addToApiReportFile: false
                    }
                }
            },
            apiReport: {
                enabled: false // Disable API report for now
            }
        };

        try {
            const extractorConfig = ExtractorConfig.prepare({
                configObject,
                configObjectFullPath: undefined,
                packageJsonFullPath: path.join(projectRoot, 'package.json')
            });

            const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
                localBuild: true,
                showVerboseMessages: true
            });

            if (extractorResult.succeeded) {
                console.log(`Successfully generated dts for ${entry.name} at ${entry.output}`);
                await postProcessDts(output);
            } else {
                console.error(`API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings`);
                process.exit(1);
            }
        } catch (e) {
            console.error(`Error generating dts for ${entry.name}:`, e);
            process.exit(1);
        }
    }

    const packageJSONPath = path.join(dtsExportRoot, 'package.json');
    const rootVersion = require(path.join(projectRoot, 'package.json')).version;
    const counter = await fetchNextVersionCounter(rootVersion);
    packageJSON.version = composeVersion(rootVersion, counter);
    
    console.log(`\nNext published version will be: ${packageJSON.version}`);
    await fs.outputJSON(packageJSONPath, packageJSON, { spaces: 4 });

    console.log('\nAll DTS generation tasks completed.');
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});
