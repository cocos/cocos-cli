import * as fs from 'fs-extra';
import * as os from 'os';
import * as ps from 'path';

const GradleLockStaleMs = 2 * 60 * 1000;

function getGradleUserHome(): string {
    return process.env.GRADLE_USER_HOME || ps.join(os.homedir(), '.gradle');
}

function parseDistributionFileName(wrapperProperties: string): string | null {
    const content = fs.readFileSync(wrapperProperties, 'utf8');
    const match = content.match(/^distributionUrl\s*=\s*(.+)$/m);
    if (!match) {
        return null;
    }
    const distributionUrl = match[1].trim().replace(/\\:/g, ':').replace(/\\/g, '');
    const fileName = ps.basename(decodeURIComponent(distributionUrl));
    return fileName.endsWith('.zip') ? fileName : null;
}

function isStaleLock(file: string): boolean {
    try {
        const stat = fs.statSync(file);
        return Date.now() - stat.mtimeMs > GradleLockStaleMs;
    } catch {
        return false;
    }
}

function shouldCleanDistributionDir(dir: string, distributionFileName: string): boolean {
    const files = fs.readdirSync(dir);
    const hasDistributionZip = files.includes(distributionFileName);
    const hasTempDownload = files.some((file) => file.endsWith('.part') || file.endsWith('.tmp'));
    const hasStaleLock = files
        .filter((file) => file.endsWith('.lck') || file.endsWith('.lock'))
        .some((file) => isStaleLock(ps.join(dir, file)));
    return !hasDistributionZip || hasTempDownload || hasStaleLock;
}

export function cleanBrokenGradleWrapperCache(projectDir: string, tag = 'Gradle') {
    const wrapperProperties = ps.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
    if (!fs.existsSync(wrapperProperties)) {
        return;
    }

    const distributionFileName = parseDistributionFileName(wrapperProperties);
    if (!distributionFileName) {
        return;
    }

    const distributionName = distributionFileName.replace(/\.zip$/, '');
    const distsDir = ps.join(getGradleUserHome(), 'wrapper', 'dists');
    const distributionRoot = ps.join(distsDir, distributionName);
    if (!fs.existsSync(distributionRoot)) {
        return;
    }

    for (const hashName of fs.readdirSync(distributionRoot)) {
        const cacheDir = ps.join(distributionRoot, hashName);
        if (!fs.statSync(cacheDir).isDirectory()) {
            continue;
        }

        if (!shouldCleanDistributionDir(cacheDir, distributionFileName)) {
            continue;
        }

        try {
            fs.removeSync(cacheDir);
            console.warn(`[${tag}] Removed broken Gradle wrapper cache: ${cacheDir}`);
        } catch (error) {
            console.warn(`[${tag}] Failed to remove broken Gradle wrapper cache: ${cacheDir}`, error);
        }
    }
}
