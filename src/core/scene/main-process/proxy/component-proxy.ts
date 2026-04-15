import {
    IComponent,
    IComponentForPinK,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IPublicComponentService,
    IExecuteComponentMethodOptions,
} from '../../common';
import {IProperty} from '../../@types/public';

import { Rpc } from '../rpc';

export const ComponentProxy: IPublicComponentService = {
    addComponent(params: IAddComponentOptions): Promise<IComponent> {
        return Rpc.getInstance().request('Component', 'addComponent', [params]);
    },

    createComponent(params: IAddComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'createComponent', [params]);
    },

    removeComponent(params: IRemoveComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'removeComponent', [params]);
    },

    queryComponent(params: IQueryComponentOptions): Promise<IComponent | IComponentForPinK | null> {
        return Rpc.getInstance().request('Component', 'queryComponent', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'setProperty', [params]);
    },

    setPropertyForPink(uuid: string, path: string, dump: IProperty, record?: boolean): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'setPropertyForPink', [uuid, path, dump, record]);
    },

    queryAllComponent(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAllComponent');
    },
    
    resetComponent(params: IQueryComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'resetComponent', [params]);
    },

    executeComponentMethod(params: IExecuteComponentMethodOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'executeComponentMethod', [params]);
    }
};
