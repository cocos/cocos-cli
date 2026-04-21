import {
    IComponent,
    IComponentForEditor,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IPublicComponentService,
    IExecuteComponentMethodOptions,
    IQueryClassesOptions,
} from '../../common';
import { IProperty } from '../../@types/public';

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

    queryComponent(params: IQueryComponentOptions): Promise<IComponent | IComponentForEditor | null> {
        return Rpc.getInstance().request('Component', 'queryComponent', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'setProperty', [params]);
    },

    queryAllComponent(): Promise<string[]> {
        return Rpc.getInstance().request('Component', 'queryAllComponent');
    },

    queryClasses(options?: IQueryClassesOptions): Promise<{ name: string }[]> {
        return Rpc.getInstance().request('Component', 'queryClasses', [options]);
    },

    queryComponentFunctionOfNode(uuid: string): Promise<any> {
        return Rpc.getInstance().request('Component', 'queryComponentFunctionOfNode', [uuid]);
    },

    queryComponentHasScript(name: string): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'queryComponentHasScript', [name]);
    },

    resetComponent(params: IQueryComponentOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'resetComponent', [params]);
    },

    executeComponentMethod(params: IExecuteComponentMethodOptions): Promise<boolean> {
        return Rpc.getInstance().request('Component', 'executeComponentMethod', [params]);
    }
};
