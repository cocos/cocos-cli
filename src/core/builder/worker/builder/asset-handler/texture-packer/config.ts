import { join } from 'path';
import { BuildGlobalInfo } from '../../../../share/builder-config';
// 记录整个自动图集的版本号，涉及到自动图集的算法策略等等
export const version = '1.0.1';
export const texturePackerTempDir = join(BuildGlobalInfo.projectRoot, `temp/builder/TexturePacker${version}`);
export const previewTempDir = join(texturePackerTempDir, 'preview');
export const buildTempDir = join(texturePackerTempDir, 'build');
// 一些内部调整而需要重新生成自动图集的版本号记录
export const versionDev = '1.0.2';
