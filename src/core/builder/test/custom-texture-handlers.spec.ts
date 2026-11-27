import { runCustomTextureHandlers } from '../worker/builder/asset-handler/texture-compress/custom-handlers';
import type { ICompressConfig } from '../@types';

describe('custom texture processors', () => {
    const queue = () => [{ uuid: 'handled' }, { uuid: 'remaining' }] as ICompressConfig[];

    it('passes the remaining queue to later processors and the built-in compressor', async () => {
        const tasks = queue();
        const later = jest.fn();
        await runCustomTextureHandlers(tasks, {
            pkgNameOrder: ['first', 'later'], required: ['first', 'later'],
            handles: { first: async (items: ICompressConfig[]) => { items.shift(); }, later },
        });
        expect(later).toHaveBeenCalledWith([{ uuid: 'remaining' }]);
        expect(tasks).toEqual([{ uuid: 'remaining' }]);
    });

    it('does not invoke processors when there is no uncached compression work', async () => {
        const handler = jest.fn();
        await runCustomTextureHandlers([], { pkgNameOrder: ['processor'], handles: { processor: handler } });
        expect(handler).not.toHaveBeenCalled();
    });

    it('fails explicit registrations while retaining legacy error handling', async () => {
        const failure = new Error('processor failed');
        const later = jest.fn();
        const infos = { pkgNameOrder: ['first', 'later'], handles: { first: async () => { throw failure; }, later } };
        await expect(runCustomTextureHandlers(queue(), { ...infos, required: ['first'] })).rejects.toBe(failure);
        expect(later).not.toHaveBeenCalled();
        await expect(runCustomTextureHandlers(queue(), infos)).resolves.toBeUndefined();
        expect(later).toHaveBeenCalledTimes(1);
    });
});
