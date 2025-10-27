import {
    IComponent,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IPublicComponentService,
} from '../../common';
import { Rpc } from '../rpc';

export const ComponentProxy: IPublicComponentService = {
    addComponent(params: IAddComponentOptions): Promise<IComponent> {
        return Rpc.request('Component', 'addComponent', [params]);
    },

    removeComponent(params: IRemoveComponentOptions): Promise<boolean> {
        return Rpc.request('Component', 'removeComponent', [params]);
    },

    queryComponent(params: IQueryComponentOptions): Promise<IComponent | null> {
        return Rpc.request('Component', 'queryComponent', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.request('Component', 'setProperty', [params]);
    },

    queryAllComponent(): Promise<string[]> {
        return Rpc.request('Component', 'queryAllComponent');
    }
};
