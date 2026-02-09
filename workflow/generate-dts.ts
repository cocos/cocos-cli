
import * as path from 'path';
import * as fs from 'fs-extra';
import {
    Extractor,
    ExtractorConfig,
    ExtractorResult,
    IConfigFile,
    ExtractorLogLevel
} from '@microsoft/api-extractor';

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
        name: 'builder-plugins',
        source: 'src/core/builder/@types/protected.ts',
        output: 'builder.d.ts'
    }, {
        name: 'api',
        source: 'src/api/index.ts',
        output: 'index.d.ts'
    }, {
        name: 'lib',
        source: 'src/lib/index.ts',
        output: 'lib.d.ts'
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
        'index.d.ts'
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
    packageJSON.version = require(path.join(projectRoot, 'package.json')).version;
    await fs.outputJSON(packageJSONPath, packageJSON, { spaces: 4 });

    console.log('\nAll DTS generation tasks completed.');
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});
