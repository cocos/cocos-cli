import { EventEmitterService } from './event-emitter';

export class BaseService<TEvents extends Record<string, any>> {
    protected readonly events = new EventEmitterService<TEvents>();
}

