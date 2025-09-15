import { WriteOptions, outputJSON } from 'fs-extra';

/**
 * Safely writes data to a JSON file with comprehensive error handling and logging
 *
 * @param {string} file - The target file path for JSON output
 * @param {any} data - The data to be serialized as JSON
 * @param {WriteOptions} [options={ spaces: 4 }] - Formatting options for JSON output
 * @returns {Promise<boolean>} - Returns true if write succeeded, false if failed
 *
 * @example
 * // Basic usage
 * const success = await safeOutputJSON('config.json', { theme: 'dark' });
 *
 * @example
 * // With custom options
 * await safeOutputJSON('data.json', dataset, { spaces: 2 });
 */
export async function safeOutputJSON(file: string, data: any, options: WriteOptions = { spaces: 4 }): Promise<boolean> {
    try {
        await outputJSON(file, data, { spaces: 4 });
        return true;
    } catch (error) {
        console.error(`Failed to write JSON file: ${file}, data: ${data}, options: ${options} `, error);
        return false;
    }
}
