import type { IReloadOptions, ReloadResult } from '../../../common';

export interface IEditorSessionSnapshot {
    readonly uuid: string | null;
    readonly generation: number;
}

/** Internal lifecycle contract shared by services that own async editor work. */
export interface IEditorSessionService {
    getEditorSession(): IEditorSessionSnapshot;
    isCurrentEditorSession(session: IEditorSessionSnapshot): boolean;
    reloadForSession(params: IReloadOptions, session: IEditorSessionSnapshot): Promise<ReloadResult>;
    /** Serialize a short result transaction with open/close/reload. Use the supplied save, not Editor.save. */
    runForSession<T>(session: IEditorSessionSnapshot, operation: (save: () => Promise<unknown>) => Promise<T>): Promise<T>;
}
