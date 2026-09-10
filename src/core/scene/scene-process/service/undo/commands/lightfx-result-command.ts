import type { IUndoCommand, IUndoRedoResult } from '../../../../common';

/** Old edits still undo normally, without reverting a later non-Undo LightFX result. */
export class LightFXResultCommand implements IUndoCommand {
    readonly meta;
    private readonly results = new Map<'light-probe' | 'lightmap', () => void | Promise<void>>();

    private constructor(private readonly command: IUndoCommand) {
        this.meta = command.meta;
    }

    static protect(command: IUndoCommand, target: 'light-probe' | 'lightmap', restore: () => void | Promise<void>): LightFXResultCommand {
        const protectedCommand = command instanceof LightFXResultCommand ? command : new LightFXResultCommand(command);
        // Replace, rather than nest, the same result after repeated Bake/Clear.
        protectedCommand.results.set(target, restore);
        return protectedCommand;
    }

    undo(): Promise<IUndoRedoResult> { return this.apply('undo'); }
    redo(): Promise<IUndoRedoResult> { return this.apply('redo'); }

    private async apply(direction: 'undo' | 'redo'): Promise<IUndoRedoResult> {
        const failures: unknown[] = [];
        let result: IUndoRedoResult | undefined;
        try {
            result = await this.command[direction]();
        } catch (error) {
            failures.push(error);
        }
        // Partially applied failed commands must not resurrect old results either.
        for (const restore of this.results.values()) {
            try { await restore(); } catch (error) { failures.push(error); }
        }
        // A missing Lightmap texture must not skip the independent SH guard.
        if (failures.length) throw failures[0];
        return result!;
    }
}
