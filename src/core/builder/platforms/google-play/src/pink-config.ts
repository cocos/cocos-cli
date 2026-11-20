import config from './config';
import { createPinKPlatformConfig } from '../../../share/pink-platform-config';
import en from '../i18n/en';
import zh from '../i18n/zh';

export const translations = { en, zh };
export default createPinKPlatformConfig(config, 'google-play');
