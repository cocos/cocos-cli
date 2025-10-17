import type { IComponentInfo, IComponent, IAddComponentOptions, IDeleteComponentOptions, IQueryComponentOptions, ISetPropertyOptions, IComponentService } from '../../common';
import { Rpc } from '../rpc';

export const ComponentProxy: IComponentService = {
    addComponent(params: IAddComponentOptions): Promise<IComponent> {
        return Rpc.request('Component', 'addComponent', [params]);
    },

    removeComponent(params: IDeleteComponentOptions): Promise<boolean> {
        return Rpc.request('Component', 'removeComponent', [params]);
    },

    queryComponent(params: IQueryComponentOptions): Promise<IComponentInfo> {
        return Rpc.request('Component', 'queryComponent', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.request('Component', 'setProperty', [params]);
    }

}
