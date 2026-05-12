export interface ISelectionService {
    select(uuid: string): void;
    unselect(uuid: string): void;
    clear(): void;
    query(): string[];
    isSelect(uuid: string): boolean;
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
