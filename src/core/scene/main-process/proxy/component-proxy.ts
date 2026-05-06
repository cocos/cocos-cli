import {
    IComponent,
    IComponentForEditor,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IPublicComponentService,
} from '../../common';

import { Rpc } from '../rpc';

export const ComponentProxy: IPublicComponentService = {
    add(params: IAddComponentOptions): Promise<IComponent> {
        return Rpc.getInstance().request('Component', 'add', [params]);
    },

    remove(params: IRemoveComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'remove', [params]);
    },

    query(params: IQueryComponentOptions): Promise<IComponent | IComponentForEditor | null> {
        return Rpc.getInstance().request('Component', 'query', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'setProperty', [params]);
    },

    queryAll(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAll');
    },
};
