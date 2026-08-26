import { promises as fs } from 'fs';
import path from 'path';
import type { IReferenceImageFileService } from '../common/reference-image';

const MIME_BY_EXTENSION: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
};

/** Node-only file boundary; it returns a JSON-safe data URL, never a Buffer. */
export class ReferenceImageFileService implements IReferenceImageFileService {
    async readDataUrl(filePath: string): Promise<string> {
        if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
            throw new Error('Reference image path must be absolute.');
        }
        const mime = MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()];
        if (!mime) {
            throw new Error('Reference image format must be PNG, JPG, or JPEG.');
        }
        let data: Buffer;
        try {
            data = await fs.readFile(filePath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Unable to read reference image: ${message}`);
        }
        return `data:${mime};base64,${data.toString('base64')}`;
    }
}

export const referenceImageFiles = new ReferenceImageFileService();
