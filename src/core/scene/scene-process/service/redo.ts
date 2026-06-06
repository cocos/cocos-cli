import { BaseService } from './core';
import { register, Service } from './core/decorator';
import type { IRedoService, IUndoRedoResult } from '../../common';

@register('Redo')
export class RedoService extends BaseService<Record<string, never[]>> implements IRedoService {
    redo(): Promise<IUndoRedoResult> {
        return Service.Undo.redo();
    }

    canRedo(): boolean {
        return Service.Undo.canRedo();
    }
}
