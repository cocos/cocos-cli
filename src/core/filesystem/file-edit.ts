import fs from 'fs';
import { EOL } from 'os';
import readline from 'readline';
import { replaceInFile } from 'replace-in-file';

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

export async function insertTextAtLine(filename: string, lineNumber: number, textToInsert: string): Promise<boolean> {
    if (textToInsert.length === 0) {
        console.warn('No text to insert.');
        return false;
    }
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
        return false;
    }

    // Replace the original file with the modified temporary file
    if (modified) {
        fs.renameSync(filename + '.tmp', filename);
        return true;
    }

    return false;
}

// End line is inclusive
export async function eraseLinesInRange(filename: string, startLine: number, endLine: number): Promise<boolean> {
    // End line must be greater than or equal to start line
    if (startLine > endLine) {
        console.warn('Invalid line range.');
        return false;
    }
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
        return false;
    }
    // Replace the original file with the modified temporary file
    if (modified) {
        fs.renameSync(filename + '.tmp', filename);
        return true;
    } else {
        fs.unlinkSync(filename + '.tmp');
        return false;
    }
}

export async function replaceTextInFile(
    filename: string, targetText: string, replacementText: string): Promise<boolean> {
    try {
        const results = await replaceInFile({
            files: filename,
            from: targetText, // First occurrence
            to: replacementText,
        });
        return results.some(result => result.hasChanged);
    } catch (error) {
        console.error('Error occurred while replacing text:', error);
        return false;
    }
}

export async function replaceTextWithRegexInFile(
    filename: string, targetRegex: string, replacementText: string): Promise<boolean> {
    try {
        const results = await replaceInFile({
            files: filename,
            from: new RegExp(targetRegex, 'g'), // Global replace
            to: replacementText,
        });
        return results.some(result => result.hasChanged);
    } catch (error) {
        console.error('Error occurred while replacing text with regex:', error);
        return false;
    }
}
