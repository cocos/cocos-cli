import os from 'os';
import path from 'path';
/**
 *
 * @param inputFile The file is the mesh data extracted from cc.Mesh for generating LightmapUV.
 * @param outFile The file is the generated LightmapUV data.
 */
export function unwrapLightmapUV(inputFile: string, outFile: string) {
    const toolName = 'uvunwrap';
    const toolExt = os.type() === 'Windows_NT' ? '.exe' : '';
    // @ts-ignore
    const tool = path.join(GlobalPaths.staticDir, 'tools/LightFX', toolName + toolExt);
    const args = ['--input', inputFile, '--output', outFile];

    // @ts-ignore
    return Editor.Utils.Process.quickSpawn(tool, args, {
        // @ts-ignore
        shell: true,
    });
}
