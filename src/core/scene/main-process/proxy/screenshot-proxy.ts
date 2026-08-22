import type { IPublicScreenshotService, IScreenshotOptions } from '../../common';
import { Rpc } from '../rpc';

export const ScreenshotProxy: IPublicScreenshotService = {
    capture(options: IScreenshotOptions) {
        return Rpc.getInstance().request('Screenshot', 'capture', [options]);
    },
};
