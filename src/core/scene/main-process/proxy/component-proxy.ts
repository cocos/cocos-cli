import type { IComponentInfo, ICreateComponentOptions, IDeleteComponentOptions, IQueryComponentOptions, ISetPropertyOptions, IComponentService } from '../../common';
import { Rpc } from '../rpc';
import { IComponent } from '../../@types/public';

export const ComponentProxy: IComponentService = {
    createComponent(params: ICreateComponentOptions): Promise<IComponentInfo | null> {
        return Rpc.request('Component', 'createComponent', [params]);
    },

    removeComponent(params: IDeleteComponentOptions): Promise<IComponentInfo | null> {
        return Rpc.request('Component', 'removeComponent', [params]);
    },

    queryComponent(params: IQueryComponentOptions): Promise<IComponent | null> {
        return Rpc.request('Component', 'queryComponent', [params]);
    },

    setProperty(params: ISetPropertyOptions): Promise<boolean> {
        return Rpc.request('Component', 'setProperty', [params]);
    }

}
