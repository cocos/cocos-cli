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
}
