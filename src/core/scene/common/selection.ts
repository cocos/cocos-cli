export interface ISelectionService {
    select(path: string): void;
    unselect(path: string): void;
    clear(): void;
    query(): string[];
    isSelect(path: string): boolean;
    reset(): void;
}

export type IPublicSelectionService = Pick<ISelectionService,
    'select' | 'unselect' | 'clear' | 'query' | 'isSelect'
>;

export interface ISelectionEvents {
    'selection:select': [path: string, paths: string[]];
    'selection:unselect': [path: string, paths: string[]];
    'selection:clear': [];
}
