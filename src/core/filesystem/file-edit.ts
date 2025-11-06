import fs from 'fs';
import { EOL } from 'os';
import readline from 'readline';
import { replaceInFile } from 'replace-in-file';
import path from 'path';
import { resolveToRaw, contains } from '../base/utils/path';

const SUPPORTED_EXTENSIONS = [
    '.js', '.ts', '.jsx', '.tsx', '.json',
    '.txt', '.md', '.xml', '.html', '.css',
];

function writeTextToStream(writeStream: fs.WriteStream, text: string): boolean {
    let succeeded = true;
    // Append EOL to maintain line breaks
    writeStream.write(text + EOL, 'utf-8', (err) => {
        if (err) {
            console.error('Error writing file:', err.message);
            succeeded = false;
        }
    });
    return succeeded;
}

function getScriptFilename(filename: string): string {
    if (filename === '') {
        throw new Error('Filename cannot be empty.');
    }
    const projectDir = resolveToRaw('project://assets');
    // Check if the rawPath is within the projectDir/assets
    if (!contains(projectDir, filename)) {
        throw new Error('Unsafe file path detected.');
    }
    const ext = path.extname(filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        throw new Error('Unsupported file type.');
    }
    return filename;
}

export async function listTextEditFileExtensions(): Promise<string[]> {
    return SUPPORTED_EXTENSIONS;
}

export async function insertTextAtLine(
    scriptPath: string, lineNumber: number, textToInsert: string): Promise<boolean> {
    if (textToInsert.length === 0) {
        throw new Error('Text to insert cannot be empty.');
    }
    if (lineNumber < 0) {
        throw new Error('Line number must be non-negative.');
    }

    const filename = getScriptFilename(scriptPath);
    const fileStream = fs.createReadStream(filename);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    // Create a temporary write stream
    const writeStream = fs.createWriteStream(filename + '.tmp');

    let currentLine = 0;
    let modified = false;
    let errorOccurred = false;
    try {
        for await (const line of rl) {
            if (currentLine === lineNumber) { // Insert text before the current line
                if (!writeTextToStream(writeStream, textToInsert)) {
                    errorOccurred = true;
                    break;
                }
                modified = true;
            }
            // Write the current line
            if (!writeTextToStream(writeStream, line)) {
                errorOccurred = true;
                break;
            }
            ++currentLine;
        }
    } catch (err) {
        console.error('insertTextAtLine error:', err);
        errorOccurred = true;
    }

    if (!errorOccurred && !modified) { // If lineNumber is greater than total lines, append at the end
        if (!writeTextToStream(writeStream, textToInsert)) {
            errorOccurred = true;
        } else {
            modified = true;
        }
    }

    // Close the read stream
    rl.close();
    fileStream.close();

    // Close the write stream
    writeStream.end();

    // If an error occurred, delete the temporary file
    if (errorOccurred || !modified) {
        fs.unlinkSync(filename + '.tmp');
        throw new Error('Failed to insert text at the specified line.');
    }

    // Replace the original file with the modified temporary file
    fs.renameSync(filename + '.tmp', filename);
    return true;
}

// End line is inclusive
export async function eraseLinesInRange(scriptPath: string, startLine: number, endLine: number): Promise<boolean> {
    // End line must be greater than or equal to start line
    if (startLine > endLine) {
        throw new Error('End line must be greater than or equal to start line.');
    }
    if (startLine < 0 || endLine < 0) {
        throw new Error('Line numbers must be non-negative.');
    }

    const filename = getScriptFilename(scriptPath);
    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    // Create a temporary write stream
    const writeStream = fs.createWriteStream(filename + '.tmp');
    let currentLine = 0;
    let modified = false;
    let errorOccurred = false;
    try {
        for await (const line of rl) {
            if (currentLine < startLine || currentLine > endLine) {
                // Write the current line if it's outside the range
                if (!writeTextToStream(writeStream, line)) {
                    errorOccurred = true;
                    break;
                }
            } else {
                modified = true; // Lines in range are skipped
            }
            ++currentLine;
        }
    } catch (err) {
        console.error('eraseLinesInRange error:', err);
        errorOccurred = true;
    }
    // Close the read stream
    rl.close();
    fileStream.close();
    // Close the write stream
    writeStream.end();
    // If an error occurred, delete the temporary file
    if (errorOccurred) {
        fs.unlinkSync(filename + '.tmp');
        throw new Error('Failed to erase lines in the specified range.');
    }
    // Replace the original file with the modified temporary file
    if (modified) {
        fs.renameSync(filename + '.tmp', filename);
        return true;
    } else {
        fs.unlinkSync(filename + '.tmp');
        throw new Error('No lines were erased. Please check the specified range.');
    }
}

export async function replaceTextInFile(
    scriptPath: string, targetRegex: string, replacementText: string): Promise<boolean> {
    const filename = getScriptFilename(scriptPath);

    const results = await replaceInFile({
        files: filename,
        from: new RegExp(targetRegex, 'g'), // Global replace
        to: replacementText,
        countMatches: true,
        dry: true, // Dry run to count matches first
    });
    let count = 0;
    for (const result of results) {
        if (result.numMatches) {
            count += result.numMatches;
        }
    }
    if (count > 1) {
        throw new Error(`Multiple (${count}) occurrences found. File is not changed.`);
    }
    if (count == 1) {
        const results = await replaceInFile({
            files: filename,
            from: new RegExp(targetRegex, 'g'), // Global replace
            to: replacementText,
        });
        return results.some(result => result.hasChanged);
    }
    throw new Error('No occurrences found. File is not changed.');
}
