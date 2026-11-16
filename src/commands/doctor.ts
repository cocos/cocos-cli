import { BaseCommand } from './base';
import { GlobalPaths } from '../global';

export class DoctorCommand extends BaseCommand {
    register(): void {
        this.program.command('doctor')
            .description('Inspect CLI and Engine SDK identity and required files without loading the engine')
            .option('-j, --project <path>', 'Read engine configuration and last initialization from this project')
            .option('--json', 'Print one JSON report for automation')
            .action((options: { project?: string; json?: boolean }) => {
                const { diagnose } = require('../../workflow/engine-diagnostics');
                const report = diagnose(GlobalPaths.workspace, {
                    projectRoot: options.project, explicitPath: this.program.opts().enginePath,
                });
                if (options.json) {
                    console.log(JSON.stringify(report, null, 2));
                } else {
                    console.log(`CLI: ${report.cli.version} (${report.cli.path})`);
                    if (report.engine) {
                        console.log(`Engine: ${report.engine.version} (${report.engine.path})`);
                        console.log(`Revision: ${report.engine.revision ?? 'unrecorded'}; source: ${report.engine.source}`);
                    }
                    console.log(`Required files and version: ${report.ok ? 'PASS' : 'FAIL'}`);
                    console.log('Runtime interfaces: not tested (engine is not loaded)');
                    for (const warning of report.warnings) console.log(`Warning: ${warning}`);
                    for (const error of report.errors) console.log(`Error: ${error}`);
                }
                process.exitCode = report.ok ? 0 : 1;
            });
    }
}
