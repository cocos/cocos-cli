import { mkdtemp, outputFile, readFile, pathExists, remove, move, readdir, symlink } from 'fs-extra';
import { dirname, join } from 'path';
import { lstatSync } from 'fs';
import { tmpdir } from 'os';

jest.mock('../asset-config', () => ({ __esModule: true, default: { data: {} } }));
jest.mock('../../base/utils', () => ({ __esModule: true, default: { Path: jest.requireActual('../../base/utils/path') } }));
import assetConfig from '../asset-config';
import { moveAssetSource, resetFileSystemProvider, setFileSystemProvider } from '../manager/filesystem';

describe('asset source move safety and compatibility', () => {
    let root: string, source: string, target: string;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'asset-move-failure-'));
        assetConfig.data.root = root;
        assetConfig.data.tempRoot = join(root, 'temp');
        source = join(root, 'source.png');
        target = join(root, 'output.png');
        await outputFile(source, 'new pixels');
        await outputFile(`${source}.meta`, '{"uuid":"original"}');
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(async () => {
        resetFileSystemProvider();
        jest.restoreAllMocks();
        await remove(root);
    });
    it('restores metadata and rejects before Asset DB can refresh a failed PNG move', async () => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) throw new Error('PNG move denied');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow('PNG move denied');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(`${target}.meta`)).toBe(false);
        expect(await pathExists(target)).toBe(false);
    });
    it.each([undefined, { overwrite: false }])('does not overwrite target metadata with options %j', async options => {
        await outputFile(`${target}.meta`, 'unrelated');
        await expect(moveAssetSource(source, target, options)).rejects.toThrow();
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('unrelated');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(true);
    });
    it.each([undefined, { overwrite: false }, { overwrite: true }])('moves both files with their UUID using options %j', async options => {
        await moveAssetSource(source, target, options);
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('replaces both the target source and metadata when overwrite is explicitly allowed', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');

        await moveAssetSource(source, target, { overwrite: true });

        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('preserves both assets when the target already exists and overwrite is omitted', async () => {
        await outputFile(target, 'unrelated pixels');
        await outputFile(`${target}.meta`, '{"uuid":"unrelated"}');

        await expect(moveAssetSource(source, target)).rejects.toThrow();

        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await readFile(target, 'utf8')).toBe('unrelated pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"unrelated"}');
    });
    it.each(['sibling', 'nested'])('preserves directory and child UUIDs when moving to a %s path', async location => {
        const folder = join(root, 'folder');
        const destination = location === 'nested' ? join(folder, 'nested') : join(root, 'moved-folder');
        await outputFile(`${folder}.meta`, '{"uuid":"folder"}');
        await outputFile(join(folder, 'child.png'), 'child pixels');
        await outputFile(join(folder, 'child.png.meta'), '{"uuid":"child"}');

        await moveAssetSource(folder, destination);

        expect(await readFile(`${destination}.meta`, 'utf8')).toBe('{"uuid":"folder"}');
        expect(await readFile(join(destination, 'child.png'), 'utf8')).toBe('child pixels');
        expect(await readFile(join(destination, 'child.png.meta'), 'utf8')).toBe('{"uuid":"child"}');
        expect(await pathExists(`${folder}.meta`)).toBe(false);
        expect(await pathExists(join(folder, 'child.png'))).toBe(false);
        expect(await pathExists(join(root, 'temp', 'move-temp', location === 'nested' ? 'folder/nested' : 'moved-folder'))).toBe(false);
    });
    it('uses the local metadata reader when only rename is overridden', async () => {
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
        });
        setFileSystemProvider({ rename });

        await moveAssetSource(source, target);

        expect(rename).toHaveBeenCalledTimes(2);
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('restores the source metadata even when a competing target PNG appears', async () => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) await outputFile(target, 'unrelated pixels');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow();
        expect(await readFile(target, 'utf8')).toBe('unrelated pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(`${target}.meta`)).toBe(false);
    });
    it.each(['source', 'target'])('never overwrites a replacement %s metadata during recovery', async location => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) {
                await outputFile(`${location === 'source' ? source : target}.meta`, 'unrelated meta');
                throw new Error('PNG move denied');
            }
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow('could not be restored safely');
        expect(await readFile(`${location === 'source' ? source : target}.meta`, 'utf8')).toBe('unrelated meta');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
    });

    it.each(['target-meta', 'target-body', 'source-meta', 'source-body'])('restores both assets after overwrite fails at %s', async step => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        const failFrom = {
            'target-meta': `${target}.meta`, 'target-body': target,
            'source-meta': `${source}.meta`, 'source-body': source,
        }[step]!;
        let failed = false;
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (!failed && from === failFrom) {
                failed = true;
                throw new Error(`denied ${step}`);
            }
            await move(from, to, { overwrite: !!options?.overwrite });
        } });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow(`denied ${step}`);
        expect(await Promise.all([source, `${source}.meta`, target, `${target}.meta`].map(path => readFile(path, 'utf8'))))
            .toEqual(['new pixels', '{"uuid":"original"}', 'old pixels', '{"uuid":"old-target"}']);
    });

    it('recovers a provider rejection that occurs after completing the source rename', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        let failed = false;
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (!failed && from === source) {
                failed = true;
                throw new Error('provider failed after rename');
            }
        } });
        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('provider failed after rename');
        expect(await Promise.all([source, `${source}.meta`, target, `${target}.meta`].map(path => readFile(path, 'utf8'))))
            .toEqual(['new pixels', '{"uuid":"original"}', 'old pixels', '{"uuid":"old-target"}']);
    });


    it('refuses to commit changed installed metadata and retains the previous target backups', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        let backup = '';
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === target && !backup) backup = to;
            if (from === source) await outputFile(`${target}.meta`, 'third-party metadata');
        } });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');

        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('third-party metadata');
        expect(await readFile(backup, 'utf8')).toBe('old pixels');
        expect(await readFile(`${backup}.meta`, 'utf8')).toBe('{"uuid":"old-target"}');
    });

    it('reports retained metadata paths when recovery never created a staging directory', async () => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === source) {
                await outputFile(source, 'third-party source');
                await outputFile(target, 'third-party target');
            }
        } });

        const error = await moveAssetSource(source, target, { overwrite: true }).catch(error => error) as AggregateError;

        expect(error.message).toContain('could not be restored safely');
        expect(error.message).toContain(JSON.stringify({
            originalPath: `${source}.meta`, lastKnownPath: `${target}.meta`,
        }));
        expect(await pathExists(join(root, 'temp', 'move-temp'))).toBe(false);
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await readFile(source, 'utf8')).toBe('third-party source');
        expect(await readFile(target, 'utf8')).toBe('third-party target');
    });

    it('keeps an unrelated replacement and recovery data instead of attaching old metadata to it', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) {
                await outputFile(target, 'third-party pixels');
            }
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');
        expect(await readFile(target, 'utf8')).toBe('third-party pixels');
        expect(await pathExists(`${target}.meta`)).toBe(false);
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
    });

    it('replaces a directory as a whole while preserving source and child UUIDs', async () => {
        const folder = join(root, 'folder');
        const destination = join(root, 'destination');
        await outputFile(`${folder}.meta`, '{"uuid":"folder"}');
        await outputFile(join(folder, 'child.png'), 'child pixels');
        await outputFile(join(folder, 'child.png.meta'), '{"uuid":"child"}');
        await outputFile(`${destination}.meta`, '{"uuid":"old-folder"}');
        await outputFile(join(destination, 'old-only.png'), 'old pixels');
        const renames: Array<{ overwrite?: boolean }> = [];
        setFileSystemProvider({ rename: async (from, to, options) => {
            renames.push(options ?? {});
            await move(from, to, { overwrite: !!options?.overwrite });
        } });

        await moveAssetSource(folder, destination, { overwrite: true });

        expect(await readFile(`${destination}.meta`, 'utf8')).toBe('{"uuid":"folder"}');
        expect(await readFile(join(destination, 'child.png.meta'), 'utf8')).toBe('{"uuid":"child"}');
        expect(await pathExists(join(destination, 'old-only.png'))).toBe(false);
        expect(renames.every(options => options.overwrite === false)).toBe(true);
    });

    it('restores a nested source move when installing the source fails', async () => {
        const folder = join(root, 'folder');
        const destination = join(folder, 'nested');
        await outputFile(`${folder}.meta`, '{"uuid":"folder"}');
        await outputFile(join(folder, 'child.txt'), 'child');
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (to === destination) throw new Error('nested install failed');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(folder, destination)).rejects.toThrow('nested install failed');
        expect(await readFile(`${folder}.meta`, 'utf8')).toBe('{"uuid":"folder"}');
        expect(await readFile(join(folder, 'child.txt'), 'utf8')).toBe('child');
        expect(await pathExists(destination)).toBe(false);
    });

    it('restores ancestor metadata after backing up the ancestor body fails', async () => {
        const parent = join(root, 'parent');
        const child = join(parent, 'child');
        await outputFile(`${parent}.meta`, '{"uuid":"parent"}');
        await outputFile(`${child}.meta`, '{"uuid":"child"}');
        await outputFile(join(child, 'item.txt'), 'child content');
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === parent) throw new Error('parent backup denied');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(child, parent, { overwrite: true })).rejects.toThrow('parent backup denied');
        expect(await readFile(`${parent}.meta`, 'utf8')).toBe('{"uuid":"parent"}');
        expect(await readFile(`${child}.meta`, 'utf8')).toBe('{"uuid":"child"}');
        expect(await readFile(join(child, 'item.txt'), 'utf8')).toBe('child content');
    });

    it.each(['rewrite', 'replace'])('does not adopt external %s of metadata while its provider rename is pending', async kind => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        let changedPath = '';
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target}.meta`) {
                changedPath = to;
                if (kind === 'replace') {
                    const replacement = join(root, 'replacement.meta');
                    await outputFile(replacement, '{"uuid":"old-target"}');
                    await move(replacement, to, { overwrite: true });
                } else {
                    await outputFile(to, 'third-party metadata');
                }
            }
        } });
        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('data changed during rename');
        expect(await readFile(changedPath, 'utf8')).toBe(kind === 'replace' ? '{"uuid":"old-target"}' : 'third-party metadata');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
    });

    it.each([
        ['source', 'body', 'rewrite'], ['source', 'body', 'replace'],
        ['source', 'metadata', 'rewrite'], ['source', 'metadata', 'replace'],
        ['target', 'body', 'rewrite'], ['target', 'body', 'replace'],
        ['target', 'metadata', 'rewrite'], ['target', 'metadata', 'replace'],
    ])('refuses to adopt a %s %s changed by %s during rollback', async (location, part, change) => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        const changedPath = `${location === 'source' ? source : target}${part === 'metadata' ? '.meta' : ''}`;
        let rollingBack = false;
        let changed = false;
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (!rollingBack && from === source) {
                rollingBack = true;
                throw new Error('provider failed after installing source');
            }
            if (rollingBack && to === changedPath && !changed) {
                changed = true;
                if (change === 'replace') {
                    const replacement = join(root, 'replacement');
                    await outputFile(replacement, 'third-party data');
                    await move(replacement, to, { overwrite: true });
                } else {
                    await outputFile(to, 'third-party data');
                }
            }
        } });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');

        expect(changed).toBe(true);
        expect(await readFile(changedPath, 'utf8')).toBe('third-party data');
        if (part === 'body') {
            expect(await pathExists(`${changedPath}.meta`)).toBe(false);
            // The matching metadata must remain recoverable, not be paired with the replacement body.
            if (location === 'source') {
                expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
            } else {
                const [recovery] = await readdir(join(root, 'temp', 'move-temp'));
                expect(await readFile(join(root, 'temp', 'move-temp', recovery, 'target.meta'), 'utf8'))
                    .toBe('{"uuid":"old-target"}');
            }
        }
    });

    it('continues safe recovery when a provider rejects after completing an inverse rename', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        let rollingBack = false;
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (!rollingBack && from === source) {
                rollingBack = true;
                throw new Error('forward completion rejected');
            }
            if (rollingBack && from === target && to === source) {
                throw new Error('inverse completion rejected');
            }
        } });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');

        expect(await Promise.all([source, `${source}.meta`, target, `${target}.meta`].map(path => readFile(path, 'utf8'))))
            .toEqual(['new pixels', '{"uuid":"original"}', 'old pixels', '{"uuid":"old-target"}']);
    });

    it('retains a recovery directory replaced by a symlink after the move commits', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        let staging = '';
        let retained = '';
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
        setFileSystemProvider({ rename: async (from, to, options) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target}.meta`) staging = dirname(to);
            if (from === source) {
                retained = `${staging}-retained`;
                await move(staging, retained);
                await symlink(retained, staging, 'dir');
            }
        } });

        await moveAssetSource(source, target, { overwrite: true });

        expect(lstatSync(staging).isSymbolicLink()).toBe(true);
        expect(await readFile(join(retained, 'target'), 'utf8')).toBe('old pixels');
        expect(await readFile(join(retained, 'target.meta'), 'utf8')).toBe('{"uuid":"old-target"}');
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(warning).toHaveBeenCalledWith(expect.stringContaining('recovery data retained'), expect.any(Error));
    });

    it.each(['rewrite', 'replace'])('does not adopt a target body changed by %s after metadata backup', async change => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        const externalOriginal = join(root, 'external-original.png');
        let retainedMeta = '';
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            if (from === source) throw new Error('source body denied');
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target}.meta`) {
                retainedMeta = to;
                if (change === 'replace') await move(target, externalOriginal);
                await outputFile(target, 'third-party pixels');
            }
        });
        setFileSystemProvider({ rename });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');

        expect(rename.mock.calls.some(([from]) => from === target || from === source)).toBe(false);
        expect(await readFile(target, 'utf8')).toBe('third-party pixels');
        expect(await pathExists(`${target}.meta`)).toBe(false);
        expect(await readFile(retainedMeta, 'utf8')).toBe('{"uuid":"old-target"}');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        if (change === 'replace') expect(await readFile(externalOriginal, 'utf8')).toBe('old pixels');
    });

    it.each(['body', 'metadata'])('does not adopt source %s replaced between overwrite steps', async part => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');
        const changedPath = part === 'body' ? source : `${source}.meta`;
        const original = join(root, 'externally-saved-source');
        const replacement = part === 'body' ? 'third-party pixels' : '{"uuid":"third-party"}';
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target}.meta`) {
                await move(changedPath, original);
                await outputFile(changedPath, replacement);
            }
        });
        setFileSystemProvider({ rename });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow(
            part === 'body' ? 'could not be restored safely' : 'recovery data changed',
        );

        expect(rename.mock.calls.some(([from]) => from === changedPath)).toBe(false);
        expect(await readFile(changedPath, 'utf8')).toBe(replacement);
        expect(await readFile(original, 'utf8')).toBe(part === 'body' ? 'new pixels' : '{"uuid":"original"}');
        if (part === 'body') {
            expect(await pathExists(`${source}.meta`)).toBe(false);
            expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        } else {
            expect(await readFile(source, 'utf8')).toBe('new pixels');
            expect(await readFile(target, 'utf8')).toBe('old pixels');
            expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"old-target"}');
        }
    });

    it('does not adopt a destination body that appeared after an orphan metadata backup', async () => {
        await outputFile(`${target}.meta`, '{"uuid":"orphan"}');
        let retainedMeta = '';
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target}.meta`) {
                retainedMeta = to;
                await outputFile(target, 'new third-party file');
            }
        });
        setFileSystemProvider({ rename });

        await expect(moveAssetSource(source, target, { overwrite: true })).rejects.toThrow('could not be restored safely');

        expect(rename.mock.calls.some(([from]) => from === target)).toBe(false);
        expect(await readFile(target, 'utf8')).toBe('new third-party file');
        expect(await pathExists(`${target}.meta`)).toBe(false);
        expect(await readFile(retainedMeta, 'utf8')).toBe('{"uuid":"orphan"}');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
    });

    it('advances the ancestor expectation after staging its nested source', async () => {
        const parent = join(root, 'parent');
        const child = join(parent, 'child');
        await outputFile(`${parent}.meta`, '{"uuid":"parent"}');
        await outputFile(`${child}.meta`, '{"uuid":"child"}');
        await outputFile(join(child, 'item.txt'), 'child content');
        await outputFile(join(child, 'item.txt.meta'), '{"uuid":"item"}');
        await outputFile(join(parent, 'old-only.txt'), 'old parent content');

        await moveAssetSource(child, parent, { overwrite: true });

        expect(await readFile(`${parent}.meta`, 'utf8')).toBe('{"uuid":"child"}');
        expect(await readFile(join(parent, 'item.txt'), 'utf8')).toBe('child content');
        expect(await readFile(join(parent, 'item.txt.meta'), 'utf8')).toBe('{"uuid":"item"}');
        expect(await pathExists(join(parent, 'old-only.txt'))).toBe(false);
        expect(await pathExists(child)).toBe(false);
    });

    it('refuses to adopt an ancestor directory replaced while staging the nested source', async () => {
        const parent = join(root, 'parent');
        const child = join(parent, 'child');
        const savedParent = join(root, 'externally-saved-parent');
        await outputFile(`${parent}.meta`, '{"uuid":"parent"}');
        await outputFile(`${child}.meta`, '{"uuid":"child"}');
        await outputFile(join(child, 'item.txt'), 'child content');
        await outputFile(join(parent, 'old-only.txt'), 'old parent content');
        const originalIdentity = lstatSync(parent).ino;
        let replaced = false;
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (!replaced && from === child) {
                replaced = true;
                await move(parent, savedParent);
                await outputFile(join(parent, 'third-party.txt'), 'third-party content');
            }
        });
        setFileSystemProvider({ rename });

        await expect(moveAssetSource(child, parent, { overwrite: true })).rejects.toThrow('ancestor destination changed');

        expect(replaced).toBe(true);
        expect(rename.mock.calls.some(([from]) => from === parent)).toBe(false);
        expect(lstatSync(parent).ino).not.toBe(originalIdentity);
        expect(await readFile(join(parent, 'third-party.txt'), 'utf8')).toBe('third-party content');
        expect(await readFile(join(savedParent, 'old-only.txt'), 'utf8')).toBe('old parent content');
    });
});
