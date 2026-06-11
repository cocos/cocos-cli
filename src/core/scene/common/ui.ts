export type UIAlignType = 'top' | 'v-center' | 'bottom' | 'left' | 'h-center' | 'right';

export interface IUIService {
    alignSelection(type: UIAlignType): Promise<void>;
    distributeSelection(type: UIAlignType): Promise<void>;
}

export type IPublicUIService = IUIService;

export interface IUIEvents {
    'ui:align-selection': [type: UIAlignType];
    'ui:distribute-selection': [type: UIAlignType];
}
