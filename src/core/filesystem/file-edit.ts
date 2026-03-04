import fs from 'fs';
import { EOL } from 'os';
import eol from 'eol';
import readline from 'readline';
import { replaceInFile } from 'replace-in-file';
import path from 'path';
import { resolveToRaw, contains } from '../base/utils/path';
import { assetManager } from '../../core/assets';
import { queryPath } from '@cocos/asset-db/libs/manager';

const LF = '\n';

function asyncWrite(stream: fs.WriteStream, chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const result = stream.write(chunk + EOL, 'utf-8');
        if (result) {
            resolve();
        } else {
            stream.once('drain', resolve);
            stream.once('error', reject);
        }
    });
}

function getScriptFilename(dbURL: string, fileType: string): string {
    fileType = '.' + fileType.toLowerCase(); // Ensure fileType starts with a dot

    const filename = queryPath(dbURL);
    if (filename === '') {
        throw new Error('Filename cannot be empty.');
    }
    const projectDir = resolveToRaw('project://assets');
    // Check if the rawPath is within the projectDir/assets
    if (!contains(projectDir, filename)) {
        throw new Error('Unsafe file path detected.');
    }
    const ext = path.extname(filename).toLowerCase();

    if (ext != fileType) {
        throw new Error(`File extension mismatch. Expected ${fileType}, but got ${ext}.`);
    }
    return filename;
}

export async function insertTextAtLine(
    dbURL: string, fileType: string, lineNumber: number, textToInsert: string): Promise<boolean> {
    --lineNumber; // Convert to zero-based index

    if (textToInsert.length === 0) {
        throw new Error('Text to insert cannot be empty.');
    }
    if (lineNumber < 0) {
        throw new Error('Line number must be non-negative.');
    }
    // Normalize EOL to the system's EOL
    textToInsert = eol.auto(textToInsert);

    const filename = getScriptFilename(dbURL, fileType);
    const tmpFilename = filename + '.tmp';
    const fileStream = fs.createReadStream(filename);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    // Create a temporary write stream
    const writeStream = fs.createWriteStream(tmpFilename);

    let currentLine = 0;
    let modified = false;
    let errorOccurred = false;
    try {
        for await (const line of rl) {
            if (currentLine === lineNumber) { // Insert text before the current line
                await asyncWrite(writeStream, textToInsert);
                modified = true;
            }
            // Write the current line
            await asyncWrite(writeStream, line);
            ++currentLine;
        }

        if (!modified) { // If lineNumber is greater than total lines, append at the end
            await asyncWrite(writeStream, textToInsert);
            modified = true;
        }
    } catch (err) {
        console.error('insertTextAtLine error:', err);
        errorOccurred = true;
    } finally {
        rl.close();
        fileStream.destroy();

        await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end();
        });
    }

    // If an error occurred, delete the temporary file
    if (errorOccurred || !modified) {
        if (fs.existsSync(tmpFilename)) {
            fs.unlinkSync(tmpFilename);
        }
        throw new Error('Failed to insert text at the specified line.');
    }

    // Replace the original file with the modified temporary file
    fs.renameSync(tmpFilename, filename);

    // Reimport script
    await assetManager.reimportAsset(dbURL);

    return true;
}

// End line is inclusive
export async function eraseLinesInRange(
    dbURL: string, fileType: string, startLine: number, endLine: number): Promise<boolean> {
    --startLine; // Convert to zero-based index
    --endLine;   // Convert to zero-based index

    // End line must be greater than or equal to start line
    if (startLine > endLine) {
        throw new Error('End line must be greater than or equal to start line.');
    }
    if (startLine < 0 || endLine < 0) {
        throw new Error('Line numbers must be non-negative.');
    }

    const filename = getScriptFilename(dbURL, fileType);
    const tmpFilename = filename + '.tmp';
    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    // Create a temporary write stream
    const writeStream = fs.createWriteStream(tmpFilename);
    let currentLine = 0;
    let modified = false;
    let errorOccurred = false;
    try {
        for await (const line of rl) {
            if (currentLine < startLine || currentLine > endLine) {
                // Write the current line if it's outside the range
                await asyncWrite(writeStream, line);
            } else {
                modified = true; // Lines in range are skipped
            }
            ++currentLine;
        }
    } catch (err) {
        console.error('eraseLinesInRange error:', err);
        errorOccurred = true;
    } finally {
        rl.close();
        fileStream.destroy();

        await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end();
        });
    }

    // If an error occurred, delete the temporary file
    if (errorOccurred) {
        if (fs.existsSync(tmpFilename)) {
            fs.unlinkSync(tmpFilename);
        }
        throw new Error('Failed to erase lines in the specified range.');
    }

    // Replace the original file with the modified temporary file
    if (modified) {
        fs.renameSync(tmpFilename, filename);

        await assetManager.reimportAsset(dbURL);

        return true;
    } else {
        if (fs.existsSync(tmpFilename)) {
            fs.unlinkSync(tmpFilename);
        }
        throw new Error('No lines were erased. Please check the specified range.');
    }
}

export function findTextOccurrencesInFile(
    filename: string, targetText: string): number {
    // Simple string search to count occurrences
    const searchStrLen = targetText.length;

    // Read the entire file content as a string
    const str = fs.readFileSync(filename, 'utf8');

    let index = -1;
    let startIndex = 0;
    let count = 0;
    while ((index = str.indexOf(targetText, startIndex)) > -1) {
        ++count;
        startIndex = index + searchStrLen;
    }
    return count;
}

export async function replaceTextInFile(
    dbURL: string, fileType: string, targetText: string, replacementText: string, regex: boolean): Promise<boolean> {
    // Normalize EOL to the system's EOL
    const targetText1 = eol.auto(targetText);
    replacementText = eol.auto(replacementText);

    // Get filename
    const filename = getScriptFilename(dbURL, fileType);

    let count = 0;
    if (regex) {
        // First, count occurrences
        const results = await replaceInFile({
            files: filename,
            from: new RegExp(targetText1, 'g'), // Global replace
            to: replacementText,
            countMatches: true,
            dry: true, // Dry run to count matches first
        });
        for (const result of results) {
            if (result.numMatches) {
                count += result.numMatches;
            }
        }
    } else {
        count = findTextOccurrencesInFile(filename, targetText1);
    }

    if (count > 1) {
        throw new Error(`Multiple (${count}) occurrences found. File is not changed.`);
    }

    if (count == 1) {
        const results = await replaceInFile({
            files: filename,
            from: regex
                ? new RegExp(targetText1, 'g') // Global replace
                : targetText1, // First occurrence
            to: replacementText,
        });

        await assetManager.reimportAsset(dbURL);

        return results.some(result => result.hasChanged);
    }
    throw new Error(`No replacement was performed, TargetText ${targetText} did not appear verbatim in ${filename}.`);
}

export async function queryLinesInFile(
    dbURL: string, fileType: string, startLine: number, lineCount: number): Promise<string> {
    --startLine; // Convert to zero-based index

    if (startLine < 0) {
        throw new Error('Start line must be non-negative.');
    }
    if (lineCount === 0) {
        throw new Error('Line count must be greater than zero or negative for all lines.');
    }

    const filename = getScriptFilename(dbURL, fileType);

    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let content: string = '';
    let currentLine = 0;
    for await (const line of rl) {
        if (currentLine >= startLine && (currentLine < startLine + lineCount || lineCount < 0)) {
            content = content.concat(`${(currentLine + 1).toString().padStart(6, ' ')}\t${line}` + LF);
        }
        ++currentLine;
    }

    // Close the read stream
    rl.close();
    fileStream.close();

    return content;
}
