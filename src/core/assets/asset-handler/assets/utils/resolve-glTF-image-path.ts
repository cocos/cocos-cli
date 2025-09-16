import ps from 'path';
import fs from 'fs-extra';

/**
 * 解析 glTF 图像的真实路径。
 * @param imageName 图像资源名。
 * @param expectedPath 图像期望的绝对路径。
 * @param glTFDir glTF 文件所在路径。
 * @param extras glTF 图像的 extras。
 * @param jail Locks the search within specified path.
 */
export async function resolveGlTfImagePath(
    imageName: string | undefined,
    expectedPath: string | undefined,
    glTFDir: string,
    extras: any,
    jail: string,
) {
    if (expectedPath && (await fs.pathExists(expectedPath))) {
        // 如果原始路径本身就存在，就直接使用该路径。
        return expectedPath;
    }

    let fbxGlTfConvImageExtrasFileName = '';
    let fbxGlTfConvImageExtrasRelativeFileName = '';
    if (typeof extras === 'object' && keyFbxGlTfConvImageExtras in extras) {
        console.debug(`Found FBX-glTF-conv specified extras: ${JSON.stringify(extras[keyFbxGlTfConvImageExtras], undefined, 2)}`);
        const { fileName, relativeFileName } = extras[keyFbxGlTfConvImageExtras] as IFbxGlTfConvImageExtras;
        if (relativeFileName) {
            fbxGlTfConvImageExtrasRelativeFileName = normalizePathInFbx(relativeFileName);
        }
        if (fileName) {
            fbxGlTfConvImageExtrasFileName = normalizePathInFbx(fileName);
        }
    }

    if (fbxGlTfConvImageExtrasRelativeFileName) {
        const path = ps.join(glTFDir, fbxGlTfConvImageExtrasRelativeFileName);
        if (await fs.pathExists(path)) {
            return path;
        }
    }

    if (fbxGlTfConvImageExtrasFileName && (await fs.pathExists(fbxGlTfConvImageExtrasFileName))) {
        return fbxGlTfConvImageExtrasFileName;
    }

    // Try find texture.

    console.debug('Image' + `(Name: ${imageName}, Expected path: ${expectedPath})` + ' is not found, fuzzy search starts.');

    const expectedExtName = expectedPath ? ps.extname(expectedPath) : '';
    const expectedExtNameLower = expectedExtName.toLowerCase();
    const expectedBaseName = expectedPath ? ps.basename(expectedPath, expectedExtName) : '';

    // 查找的 baseName。
    const searchBaseNames = new Set<string>();
    if (expectedBaseName.length !== 0) {
        searchBaseNames.add(expectedBaseName);
    }
    if (imageName) {
        searchBaseNames.add(imageName);
    }
    if (fbxGlTfConvImageExtrasFileName) {
        searchBaseNames.add(ps.basename(fbxGlTfConvImageExtrasFileName, ps.extname(fbxGlTfConvImageExtrasFileName)));
    }
    if (fbxGlTfConvImageExtrasRelativeFileName) {
        searchBaseNames.add(ps.basename(fbxGlTfConvImageExtrasRelativeFileName, ps.extname(fbxGlTfConvImageExtrasRelativeFileName)));
    }
    if (searchBaseNames.size === 0) {
        return null;
    }

    // 查找的扩展名。
    const searchExtensions = ['.jpg', '.jpeg', '.png', '.tga', '.webp'];
    if (expectedExtName.length !== 0 && !searchExtensions.includes(expectedExtNameLower)) {
        searchExtensions.unshift(expectedExtNameLower);
    }

    // 查找的文件夹。
    const searchDirectories = ['textures', 'materials'];

    // 查找的深度。
    const maxDepth = 2;

    const normalizedJail = toNormalizedAbsolute(jail);
    const isInJail = (p: string) => {
        return p.startsWith(normalizedJail);
    };

    const searchBaseNamesArray = Array.from(searchBaseNames);
    let baseDir = toNormalizedAbsolute(glTFDir);
    for (let i = 0; i < maxDepth && isInJail(baseDir); ++i) {
        const result = await fuzzySearchTexture(baseDir, searchBaseNamesArray, searchExtensions);
        if (result) {
            console.debug(`Found ${result}, use it.`);
            return result;
        }

        const items = await fs.readdir(baseDir);
        for (const item of items) {
            if (!searchDirectories.some((searchDir) => caseInsensitiveStringEqual(item, searchDir))) {
                continue;
            }

            const dir = ps.join(baseDir, item);
            try {
                const stat = await fs.stat(dir);
                if (!stat.isDirectory()) {
                    continue;
                }
            } catch {}

            const result = await fuzzySearchTexture(dir, searchBaseNamesArray, searchExtensions);
            if (result) {
                console.debug(`Found ${result}, use it.`);
                return result;
            }
        }
        baseDir = ps.dirname(baseDir);
    }

    const expectedFileNames: string[] = [];
    for (const ext of searchExtensions) {
        for (const baseName of searchBaseNamesArray) {
            expectedFileNames.push(`${baseName}${ext}`.toLowerCase());
        }
    }

    for (const path of listFile(glTFDir)) {
        const baseName = ps.basename(path).toLowerCase();
        if (expectedFileNames.includes(baseName)) {
            return path;
        }
    }
    console.debug('Fuzzy search failed.');
    return null;
}

function* listFile(directory: string): Generator<string> {
    const dirItems = fs.readdirSync(directory);
    for (const dirItem of dirItems) {
        const fullPath = ps.join(directory, dirItem);
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
            yield fullPath;
        } else if (stats.isDirectory()) {
            yield* listFile(fullPath);
        }
    }
}

function toNormalizedAbsolute(p: string) {
    const np = ps.isAbsolute(p) ? p : ps.join(process.cwd(), p);
    return ps.normalize(np);
}

async function fuzzySearchTexture(directory: string, baseNames: string[], extensions: string[]) {
    if (!(await fs.pathExists(directory))) {
        return null;
    }
    const dirItems = await fs.readdir(directory);
    for (const dirItem of dirItems) {
        const extName = ps.extname(dirItem);
        const baseName = ps.basename(dirItem, extName);
        if (!baseNames.some((item) => caseInsensitiveStringEqual(baseName, item))) {
            continue;
        }
        const fullName = ps.join(directory, dirItem);
        const stat = await fs.stat(fullName);
        if (!stat.isFile()) {
            continue;
        }
        if (extensions.indexOf(extName.toLowerCase()) >= 0) {
            return fullName;
        }
    }
    return null;
}

function caseInsensitiveStringEqual(a: string, b: string) {
    return a.length === b.length && a.toLowerCase() === b.toLowerCase();
}

const keyFbxGlTfConvImageExtras = 'FBX-glTF-conv';

interface IFbxGlTfConvImageExtras {
    /**
     * See `FbxFileTexture::GetFileName()`.
     */
    fileName: string;

    /**
     * See `FbxFileTexture::GetRelativeFileName()`.
     */
    relativeFileName: string;
}

function normalizePathInFbx(path: string) {
    return path.split(/[\\/]/g).join(ps.sep);
}
