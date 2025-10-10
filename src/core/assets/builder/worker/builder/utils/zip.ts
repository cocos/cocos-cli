import { readFileSync, writeFileSync, removeSync, readdirSync, statSync } from 'fs-extra';
import { relative, join, parse } from 'path';
import JsZip from 'jszip';
import { BuildGlobalInfo } from '../../../share/builder-config';
export async function compressDirs(dirnames: string[], basepath: string, outputPath: string) {
    await new Promise<void>(resolve => {
        const jsZip = new JsZip();
        const filesToCompress: string[] = [];
        const dir = parse(BuildGlobalInfo.BUNDLE_ZIP_NAME).name;
        dirnames.forEach(dirname => {
            getFilesInDirectory(filesToCompress, dirname);
        });
        // https://stackoverflow.com/questions/57175871/how-to-make-jszip-generate-same-buffer/57177371#57177371?newreg=b690df5d033d4576bb3be28f6bb010ab
        // https://adoyle.me/blog/why-zip-file-checksum-changed.html
        const options = {
            date: new Date('2021.06.21 06:00:00Z'),
            createFolders: false,
        };
        filesToCompress.forEach(filepath => {
            const relativePath = relative(basepath, filepath);
            let targetPath = join(dir, relativePath);
            targetPath = targetPath.replace(/\\/g, '/');
            jsZip.file(targetPath, readFileSync(filepath), options);
        });
        jsZip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9,
            },
        }).then((content: any) => {
            writeFileSync(outputPath, content);
            dirnames.forEach((dirname) => {
                removeSync(dirname);
            });
            resolve();
        });
    });
}

function getFilesInDirectory(output: string[], dirname: string) {
    const dirlist = readdirSync(dirname);
    dirlist.forEach(item => {
        const absolutePath = join(dirname, item);
        const statInfo = statSync(absolutePath);
        if (statInfo.isDirectory()) {
            getFilesInDirectory(output, absolutePath);
        }
        else {
            output.push(absolutePath);
        }
    });
}