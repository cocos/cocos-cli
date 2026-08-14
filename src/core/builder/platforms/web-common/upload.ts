import { createCipheriv, createHash, randomBytes } from 'crypto';
import { basename, dirname, join, relative } from 'path';
import JsZip from 'jszip';
import {
    existsSync,
    outputFileSync,
    readFileSync,
    readdirSync,
    statSync,
} from 'fs-extra';
import { IBuildStageTask, IInternalBuildOptions } from '../../@types/protected';

export type UploadEnv = 'dev' | 'fat' | 'prod';

export interface IWebUploadOptions {
    app_id?: string;
    versionName?: string;
    accessToken?: string;
    uploadEnv?: UploadEnv;
    codeVersion?: string | number | null;
    encryptKey?: string;
    bridgeBuildToken?: string;
    entryPath?: string;
}

export type IWebUploadTaskOption = IInternalBuildOptions;

interface OpenPaasResponse<T = unknown> {
    ret_code: number;
    ret_msg: string;
    data: T;
}

interface UploadMainPackageResponse {
    package_id: string;
}

interface WebUploadPackageInfo {
    packagePath: string;
    sourcePackagePath: string;
    md5: string;
    secret: string;
}

type BuildStageTaskWithProgress = IBuildStageTask & {
    updateProcess?: (message: string, increment?: number) => void;
    break?: (reason: string) => void;
};

class UploadHttpError extends Error {
    constructor(message: string, public readonly status: number, public readonly retryAfter: string | null) {
        super(message);
    }
}

const UPLOAD_STAGE_PROGRESS_WEIGHT = 0.2;
const MAX_UPLOAD_RETRIES = 5;
const WEB_PACKAGE_UPLOAD_API = '/api/game/web/package/upload';
const AES_128_GCM_KEY_BYTES = 16;
const AES_GCM_IV_BYTES = 12;
const UPLOAD_BASE_URLS: Record<UploadEnv, string> = {
    dev: 'https://dev-agent-api.s00.tech',
    fat: 'https://fat-agent-api.s00.tech',
    prod: 'https://cn-000-agent-api.s01.tech',
};

export async function onBeforeUpload(platform: string, root: string, options: IWebUploadTaskOption) {
    const packageOptions = getPackageOptions(platform, options);
    if (!existsSync(root)) {
        throw new Error(`Upload root does not exist: ${root}`);
    }
    if (!resolveGameId(packageOptions)) {
        throw new Error('Missing app_id, cannot upload web package');
    }
    if (!packageOptions.versionName) {
        throw new Error('Missing versionName, cannot upload web package');
    }
    if (!normalizeCodeVersion(packageOptions.codeVersion ?? process.env.OPENPAAS_CODE_VERSION)) {
        throw new Error('Missing codeVersion, cannot upload web package');
    }
    if (!resolveBridgeBuildToken(packageOptions)) {
        throw new Error('Missing bridgeBuildToken, cannot upload web package');
    }
}

export async function upload(task: IBuildStageTask, platform: string, root: string, options: IWebUploadTaskOption) {
    const packageOptions = getPackageOptions(platform, options);
    const gameId = resolveGameId(packageOptions);
    const version = String(packageOptions.versionName || '').trim();
    const accessToken = resolveAccessToken(packageOptions);
    if (!accessToken) {
        throw new Error('Missing OpenPaaS access token. Pass accessToken in upload options or OPENPAAS_ACCESS_TOKEN/SUD_ACCESS_TOKEN env.');
    }

    const uploadPackage = await resolveWebUploadPackage(platform, root, options);
    const uploadPackagePath = uploadPackage.packagePath;
    const md5 = uploadPackage.md5;
    const codeVersion = normalizeCodeVersion(packageOptions.codeVersion ?? process.env.OPENPAAS_CODE_VERSION);
    if (!codeVersion) {
        throw new Error('Missing codeVersion, cannot upload web package');
    }
    const bridgeBuildToken = resolveBridgeBuildToken(packageOptions);
    if (!bridgeBuildToken) {
        throw new Error('Missing bridgeBuildToken, cannot upload web package');
    }
    const webTokenHash = createSha256(bridgeBuildToken);
    const terminal = resolveTerminal(platform);
    const entryPath = resolveEntryPath(root, packageOptions);
    const baseUrl = resolveUploadBaseUrl(packageOptions);
    const progress = createUploadProgressReporter(task);
    const abortController = new AbortController();
    const restoreAbortBinding = bindUploadAbort(task, abortController);

    console.log(`[web-upload] Upload start: platform=${platform}, game_id=${gameId}, version=${version}, package=${uploadPackagePath}`);
    progress.report('[web-upload] Preparing package', 0);
    task.buildExitRes.custom.upload = {
        pending: true,
        success: false,
        package: {
            path: uploadPackagePath,
            sourcePath: uploadPackage.sourcePackagePath,
            md5,
        },
        terminal,
        entryPath,
        version,
        codeVersion,
    };

    try {
        const packageId = await uploadMainPackage(baseUrl, accessToken, {
            packagePath: uploadPackagePath,
            gameId,
            version,
            secret: uploadPackage.secret,
            md5,
            codeVersion,
            terminal,
            webTokenHash,
            entryPath,
            signal: abortController.signal,
        });
        task.buildExitRes.custom.upload = {
            pending: false,
            success: true,
            packageId,
            package: {
                path: uploadPackagePath,
                sourcePath: uploadPackage.sourcePackagePath,
                md5,
            },
            terminal,
            entryPath,
            version,
            codeVersion,
        };
        progress.report(`[web-upload] Upload completed: package_id=${packageId}`, 1);
        console.log(`[web-upload] Upload success: package_id=${packageId}`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        task.buildExitRes.custom.upload = {
            pending: false,
            success: false,
            reason,
            package: {
                path: uploadPackagePath,
                sourcePath: uploadPackage.sourcePackagePath,
                md5,
            },
            terminal,
            entryPath,
            version,
            codeVersion,
        };
        progress.report(`[web-upload] Upload failed: ${reason}`, 0);
        console.error(`[web-upload] Upload failed: ${reason}`);
        throw error;
    } finally {
        restoreAbortBinding();
    }
}

export async function onAfterUpload(task: IBuildStageTask) {
    const uploadResult = task.buildExitRes.custom.upload;
    if (uploadResult?.pending) {
        console.log(`[web-upload] Upload task started: ${JSON.stringify(uploadResult)}`);
    } else if (uploadResult) {
        console.log(`[web-upload] Upload completed: ${JSON.stringify(uploadResult)}`);
    }
}

function getPackageOptions(platform: string, options: IWebUploadTaskOption): IWebUploadOptions {
    return (options.packages?.[platform] || {}) as IWebUploadOptions;
}

function resolveGameId(options: IWebUploadOptions): string {
    return String(options.app_id || '').trim();
}

function resolveAccessToken(options: IWebUploadOptions): string {
    return String(options.accessToken || process.env.OPENPAAS_ACCESS_TOKEN || process.env.SUD_ACCESS_TOKEN || '').trim();
}

function resolveBridgeBuildToken(options: IWebUploadOptions): string {
    return String(options.bridgeBuildToken || '').trim();
}

function resolveTerminal(platform: string): string {
    if (platform === 'web-desktop') {
        return '1';
    }
    if (platform === 'web-mobile') {
        return '2';
    }
    throw new Error(`Unsupported web upload platform: ${platform}`);
}

function resolveEntryPath(root: string, options: IWebUploadOptions): string | undefined {
    const configuredEntryPath = String(options.entryPath || '').trim().replace(/\\/g, '/');
    if (configuredEntryPath) {
        return configuredEntryPath;
    }
    return existsSync(join(root, 'index.html')) ? 'index.html' : undefined;
}

function resolveUploadBaseUrl(options: IWebUploadOptions): string {
    const customBaseUrl = String(process.env.OPENPAAS_UPLOAD_BASE_URL || '').trim();
    if (customBaseUrl) {
        return customBaseUrl.replace(/\/$/, '');
    }
    const env = normalizeUploadEnv(options.uploadEnv)
        ?? normalizeUploadEnv(process.env.OPENPAAS_UPLOAD_ENV)
        ?? normalizeUploadEnv(process.env.SUD_UPLOAD_ENV)
        ?? 'prod';
    return UPLOAD_BASE_URLS[env];
}

function normalizeUploadEnv(value: unknown): UploadEnv | undefined {
    return value === 'dev' || value === 'fat' || value === 'prod' ? value : undefined;
}

function normalizeCodeVersion(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const normalized = String(value).trim();
    return normalized || undefined;
}

async function resolveWebUploadPackage(platform: string, root: string, options: IWebUploadTaskOption): Promise<WebUploadPackageInfo> {
    const outputName = options.outputName || basename(root) || platform;
    const outputPath = join(dirname(root), `${outputName}.zip`);
    const encryptedOutputPath = join(dirname(root), `${outputName}.zip.enc`);
    await zipDirectory(root, outputPath);
    const md5 = computeFileMd5(outputPath);
    const secret = encryptPackage(outputPath, encryptedOutputPath);
    return {
        packagePath: encryptedOutputPath,
        sourcePackagePath: outputPath,
        md5,
        secret,
    };
}

function encryptPackage(inputPath: string, outputPath: string): string {
    const secret = randomBytes(AES_128_GCM_KEY_BYTES).toString('hex');
    const key = Buffer.from(secret, 'hex');
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const cipher = createCipheriv('aes-128-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(readFileSync(inputPath)),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    outputFileSync(outputPath, Buffer.concat([iv, encrypted, authTag]));
    return secret;
}

async function zipDirectory(root: string, outputPath: string) {
    const jsZip = new JsZip();
    const filesToCompress: string[] = [];
    collectFiles(filesToCompress, root);
    const options = {
        date: new Date('2021.06.21 06:00:00Z'),
        createFolders: false,
    };
    filesToCompress.forEach((filePath) => {
        let targetPath = relative(root, filePath);
        targetPath = targetPath.replace(/\\/g, '/');
        jsZip.file(targetPath, readFileSync(filePath), options);
    });
    const content = await jsZip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 9,
        },
    });
    outputFileSync(outputPath, content);
}

function collectFiles(output: string[], dirname: string) {
    const dirlist = readdirSync(dirname);
    dirlist.forEach((item) => {
        const absolutePath = join(dirname, item);
        const statInfo = statSync(absolutePath);
        if (statInfo.isDirectory()) {
            collectFiles(output, absolutePath);
        } else {
            output.push(absolutePath);
        }
    });
}

async function uploadMainPackage(baseUrl: string, accessToken: string, params: {
    packagePath: string;
    gameId: string;
    version: string;
    secret: string;
    md5: string;
    codeVersion: string;
    terminal: string;
    webTokenHash: string;
    entryPath?: string;
    signal?: AbortSignal;
}): Promise<string> {
    const fields: Record<string, string> = {
        game_id: params.gameId,
        code_version: params.codeVersion,
        terminal: params.terminal,
        version: params.version,
        web_token_hash: params.webTokenHash,
        md5: params.md5,
        secret: params.secret,
    };
    if (params.entryPath) {
        fields.entry_path = params.entryPath;
    }

    const response = await uploadPackageWithRetry<UploadMainPackageResponse>(baseUrl, accessToken, WEB_PACKAGE_UPLOAD_API, params.packagePath, fields, params.signal);
    const packageId = response.package_id;
    if (!packageId) {
        throw new Error('Package upload succeeded but no package_id returned');
    }
    return packageId;
}

async function uploadPackageWithRetry<T>(baseUrl: string, accessToken: string, apiPath: string, packagePath: string, fields: Record<string, string>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
        try {
            throwIfUploadAborted(signal);
            return await uploadPackage<T>(baseUrl, accessToken, apiPath, packagePath, fields, signal);
        } catch (error) {
            if (signal?.aborted || !shouldRetryUpload(error) || attempt === MAX_UPLOAD_RETRIES) {
                throw error;
            }
            const delay = getRetryDelay(error, attempt);
            console.warn(`[web-upload] Retry ${attempt + 1}/${MAX_UPLOAD_RETRIES} after ${delay}ms: ${error instanceof Error ? error.message : String(error)}`);
            await waitForUploadRetry(delay, signal);
        }
    }
    throw new Error('Upload retry loop exited unexpectedly');
}

async function uploadPackage<T>(baseUrl: string, accessToken: string, apiPath: string, packagePath: string, fields: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const form = new FormData();
    const fileBuffer = readFileSync(packagePath);
    form.append('package', new Blob([new Uint8Array(fileBuffer)]), basename(packagePath));
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));

    console.log(`[web-upload] POST ${apiPath}: package=${packagePath}, fields=${Object.keys(fields).join(',')}`);
    const response = await fetch(`${baseUrl}${apiPath}`, {
        method: 'POST',
        headers: {
            'x-sud-at': accessToken,
            'x-sud-encrypt-request': 'true',
        },
        body: form,
        signal,
    });

    if (!response.ok) {
        throw new UploadHttpError(`Upload request failed: HTTP ${response.status}`, response.status, response.headers.get('retry-after'));
    }

    const result = await response.json() as OpenPaasResponse<T>;
    if (result.ret_code !== 0) {
        throw new Error(`Upload API error: ${result.ret_code} ${result.ret_msg}`);
    }
    return result.data;
}

function createUploadProgressReporter(task: IBuildStageTask) {
    const taskWithProgress = task as BuildStageTaskWithProgress;
    let reportedProgress = 0;
    return {
        report(message: string, completedPackages: number) {
            const nextProgress = Math.max(0, Math.min(UPLOAD_STAGE_PROGRESS_WEIGHT, completedPackages * UPLOAD_STAGE_PROGRESS_WEIGHT));
            const increment = Math.max(0, nextProgress - reportedProgress);
            reportedProgress = nextProgress;
            if (typeof taskWithProgress.updateProcess === 'function') {
                taskWithProgress.updateProcess(message, increment);
            } else {
                console.log(message);
            }
        },
    };
}

function bindUploadAbort(task: IBuildStageTask, controller: AbortController): () => void {
    const taskWithProgress = task as BuildStageTaskWithProgress;
    if (typeof taskWithProgress.break !== 'function') {
        return () => {};
    }
    const originalBreak = taskWithProgress.break;
    taskWithProgress.break = function(reason: string) {
        controller.abort(new Error(reason));
        return originalBreak.call(this, reason);
    };
    return () => {
        taskWithProgress.break = originalBreak;
    };
}

function throwIfUploadAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('Upload aborted');
    }
}

function waitForUploadRetry(delay: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal!.reason instanceof Error ? signal!.reason : new Error('Upload aborted'));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, delay);
        if (signal) {
            if (signal.aborted) {
                clearTimeout(timer);
                reject(signal.reason instanceof Error ? signal.reason : new Error('Upload aborted'));
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function shouldRetryUpload(error: unknown): boolean {
    if (error instanceof UploadHttpError) {
        if (error.status === 413) {
            return false;
        }
        return error.status === 429 || !error.status || error.status >= 500;
    }
    return error instanceof TypeError;
}

function getRetryDelay(error: unknown, attempt: number): number {
    if (error instanceof UploadHttpError && error.status === 429 && error.retryAfter) {
        const retryAfterSeconds = Number.parseInt(error.retryAfter, 10);
        if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
            return retryAfterSeconds * 1000;
        }
        return 5000;
    }
    return Math.pow(2, attempt) * 1000;
}

function computeFileMd5(filePath: string): string {
    const buffer = readFileSync(filePath);
    return createHash('md5').update(buffer).digest('hex');
}

function createSha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}
