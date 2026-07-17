import * as fs from 'fs-extra';
import * as ps from 'path';
import AndroidPackTool from './android';

export default class HuaweiAGCPackTool extends AndroidPackTool {
    private readonly templatePlatform = 'android';

    protected async copyPlatformTemplate(): Promise<void> {
        if (!fs.existsSync(this.paths.nativePrjDir)) {
            await fs.copy(
                ps.join(this.paths.nativeTemplateDirInCocos, this.templatePlatform, 'build'),
                this.paths.nativePrjDir,
                { overwrite: false },
            );
        }

        if (!fs.existsSync(this.paths.platformTemplateDirInPrj)) {
            await fs.copy(
                ps.join(this.paths.nativeTemplateDirInCocos, this.templatePlatform, 'template'),
                this.paths.platformTemplateDirInPrj,
                { overwrite: false },
            );
            this.writeEngineVersion();
        } else {
            this.validateNativeDir();
        }
    }

    protected validatePlatformDirectory(missing: string[]): void {
        this.validateDirectory(
            ps.join(this.paths.nativeTemplateDirInCocos, this.templatePlatform, 'template'),
            this.paths.platformTemplateDirInPrj,
            missing,
        );
    }
}
