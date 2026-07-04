import { BaseService } from './core';
import { register, Service } from './core/decorator';
import type { IRedoService, IUndoOperationOptions, IUndoRedoResult } from '../../common';

@register('Redo')
export class RedoService extends BaseService<Record<string, never[]>> implements IRedoService {
    redo(options?: IUndoOperationOptions): Promise<IUndoRedoResult> {
        return Service.Undo.redo(options);
    }

    canRedo(options?: IUndoOperationOptions): boolean {
        return Service.Undo.canRedo(options);
    }
}
