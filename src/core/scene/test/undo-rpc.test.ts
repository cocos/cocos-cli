import { EventEmitter } from 'events';
import { ProcessRPC } from '../process-rpc';
import { queryRegisteredService, register, Service } from '../scene-process/service/core/decorator';

class TestUndo {
    #count = 0;
    protectedCallFinished?: () => void;

    beginRecording(): string { return `recording:${++this.#count}`; }
    async beginRecordingAsync(): Promise<string> {
        await Promise.resolve();
        const result = `protected:${this.beginRecording()}`;
        this.protectedCallFinished?.();
        return result;
    }
    beginGroup(): string { return `group:${++this.#count}`; }
    async beginGroupAsync(): Promise<string> {
        await Promise.resolve();
        const result = `protected:${this.beginGroup()}`;
        this.protectedCallFinished?.();
        return result;
    }
    isDirty(): boolean { return this.#count > 0; }
}

interface Response { result?: unknown; error?: string }

describe('Explicit Undo RPC dispatch', () => {
    let rpc: ProcessRPC<{ Undo: TestUndo }>;
    let target: TestUndo;
    let incoming: EventEmitter;
    let outgoing: EventEmitter;

    beforeEach(() => {
        // Exercise the real Service proxy: it must continue returning the actual instance.
        register('Undo')(TestUndo);
        target = queryRegisteredService<TestUndo>('Undo')!;
        incoming = new EventEmitter();
        outgoing = new EventEmitter();
        const transport = Object.assign(incoming, {
            send: (message: Response) => { outgoing.emit('response', message); },
        });
        rpc = new ProcessRPC<{ Undo: TestUndo }>();
        rpc.attach(transport as unknown as NodeJS.Process);
        rpc.register(Service);
    });

    afterEach(() => rpc.dispose());

    function request(method: string): Promise<Response> {
        return new Promise(resolve => {
            outgoing.once('response', resolve);
            incoming.emit('message', { type: 'request', id: 1, module: 'Undo', method, args: [] });
        });
    }

    it('returns the original instance and synchronous results for direct calls', () => {
        expect(Service.Undo).toBe(target);
        expect(Service.Undo.beginRecording([])).toBe('recording:1');
        expect(Service.Undo.beginGroup()).toBe('group:2');
    });

    it('calls explicitly requested Async methods on the same instance', async () => {
        await expect(request('beginRecordingAsync')).resolves.toMatchObject({ result: 'protected:recording:1' });
        await expect(request('beginGroupAsync')).resolves.toMatchObject({ result: 'protected:group:2' });
        expect(Service.Undo.beginRecording([])).toBe('recording:3');
    });

    it('does not rewrite synchronous method names', async () => {
        await expect(request('beginRecording')).resolves.toMatchObject({ result: 'recording:1' });
        await expect(request('beginGroup')).resolves.toMatchObject({ result: 'group:2' });
    });

    it('calls explicit Async methods through HTTP/local RPC execution', async () => {
        await expect(rpc.executeLocal('Undo', 'beginRecordingAsync', [])).resolves.toBe('protected:recording:1');
        await expect(rpc.executeLocal('Undo', 'beginGroupAsync', [])).resolves.toBe('protected:group:2');
        await expect(rpc.executeLocal('Undo', 'isDirty', [])).resolves.toBe(true);
    });

    it('calls the explicit Async method for notifications', async () => {
        const finished = new Promise<void>(resolve => { target.protectedCallFinished = resolve; });
        incoming.emit('message', { type: 'notify', module: 'Undo', method: 'beginRecordingAsync', args: [] });
        await finished;
        expect(target.beginGroup()).toBe('group:2');
    }, 1000);

    it('keeps ordinary dispatch and missing-method errors intact', async () => {
        await expect(request('isDirty')).resolves.toMatchObject({ result: false });
        await expect(request('missing')).resolves.toMatchObject({ error: 'Method not found: Undo.missing' });
    });
});
