import { pathToDbUrlIfAssetDBPath } from '../asset-db-url';

function withPlatform<T>(platform: NodeJS.Platform, action: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
    try {
        return action();
    } finally {
        Object.defineProperty(process, 'platform', descriptor);
    }
}

describe('pathToDbUrlIfAssetDBPath database-name casing', () => {
    const assetDBInfo = {
        assets: { name: 'assets', target: 'C:\\project\\assets' },
    };

    it('normalizes a differently-cased database name on Windows', () => {
        withPlatform('win32', () => {
            expect(pathToDbUrlIfAssetDBPath('ASSETS\\scripts\\GameBoard.ts', assetDBInfo))
                .toBe('db://assets/scripts/GameBoard.ts');
            expect(pathToDbUrlIfAssetDBPath('Assets', assetDBInfo)).toBe('db://assets');
            expect(pathToDbUrlIfAssetDBPath('ASSETS2\\scripts\\GameBoard.ts', assetDBInfo))
                .toBe('ASSETS2\\scripts\\GameBoard.ts');
        });
    });

    it('keeps database names case-sensitive outside Windows', () => {
        withPlatform('linux', () => {
            expect(pathToDbUrlIfAssetDBPath('ASSETS\\scripts\\GameBoard.ts', assetDBInfo))
                .toBe('ASSETS\\scripts\\GameBoard.ts');
        });
    });
});
