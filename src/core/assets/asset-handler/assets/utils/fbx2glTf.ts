/**
 * Copyright (c) 2014-present, Facebook, Inc.
 * All rights reserved.
 */

import childProcess from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import rimraf from 'rimraf';
import { i18nTranslate } from '../../utils';

/**
 * Converts an FBX to a GTLF or GLB file.
 * @param string srcFile path to the source file.
 * @param string destFile path to the destination file.
 * This must end in `.glb` or `.gltf` (case matters).
 * @param string[] [opts] options to pass to the converter tool.
 * @return Promise<string> a promise that yields the full path to the converted
 * file, an error on conversion failure.
 */
export function convert(srcFile: string, destFile: string, opts: string[] = []) {
    return new Promise((resolve, reject) => {
        try {
            const fbx2gltfRoot = path.dirname(require.resolve('@cocos/fbx2gltf'));

            const binExt = os.type() === 'Windows_NT' ? '.exe' : '';
            let tool = path.join(fbx2gltfRoot, 'bin', os.type(), 'FBX2glTF' + binExt);

            const temp = tool.replace('app.asar', 'app.asar.unpacked');
            if (fs.existsSync(temp)) {
                tool = temp;
            }

            if (!fs.existsSync(tool)) {
                throw new Error(`Unsupported OS: ${os.type()}`);
            }

            let destExt = '';
            if (destFile.endsWith('.glb')) {
                destExt = '.glb';
                opts.includes('--binary') || opts.push('--binary');
            } else if (destFile.endsWith('.gltf')) {
                destExt = '.gltf';
            } else {
                throw new Error(`Unsupported file extension: ${destFile}`);
            }
            if (destExt.length !== 0) {
                fs.ensureDirSync(path.dirname(destFile));
            }

            const srcPath = fs.realpathSync(srcFile);
            const srcDir = path.dirname(srcPath);
            const destPath = destFile;

            const srcName = path.basename(srcPath);

            const args = opts.slice(0);
            args.push('--input', srcName, '--output', destPath);
            const child = childProcess.spawn(tool, args, {
                cwd: srcDir,
            });

            let output = '';
            if (child.stdout) {
                child.stdout.on('data', (data) => (output += data));
            }
            if (child.stderr) {
                child.stderr.on('data', (data) => (output += data));
            }
            child.on('error', reject);
            child.on('close', (code) => {
                // the FBX SDK may create an .fbm dir during conversion; delete!
                const fbmCruft = srcPath.replace(/.fbx$/i, '.fbm');
                // don't stick a fork in things if this fails, just log a warning
                const onError = (error: any) => error && console.warn(`Failed to delete ${fbmCruft}: ${error}`);
                try {
                    fs.existsSync(fbmCruft) && rimraf(fbmCruft, {}, onError);
                } catch (error) {
                    onError(error);
                }

                // non-zero exit code is failure
                if (code !== 0) {
                    // If code is 3, the output may not be flushed.
                    // See https://docs.microsoft.com/en-us/previous-versions/k089yyh0(v%3Dvs.140)
                    reject(
                        new Error(
                            i18nTranslate('engine-extends.importers.fbx.fbx2glTF_exists_with_non_zero_code', {
                                code,
                                output: output.length ? output : '<none>',
                            }),
                        ),
                    );
                } else {
                    resolve(destPath);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}
