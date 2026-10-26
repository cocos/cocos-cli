import { join } from 'path';
import { getName } from '../utils/file';

describe('file utilities', () => {
    it('uses caller reservations when resolving an available name', () => {
        const directory = '/virtual/assets';
        const file = join(directory, 'snake_head.png');
        const occupied = new Set([
            file,
            join(directory, 'snake_head-001.png'),
            join(directory, 'snake_head-002.png'),
        ]);

        expect(getName(file, (candidate) => occupied.has(candidate))).toBe(
            join(directory, 'snake_head-003.png'),
        );
    });
});
