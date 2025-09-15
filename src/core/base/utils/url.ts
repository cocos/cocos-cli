
const urls = {
    manual: 'https://docs.cocos.com/creator/manual/zh/',
    api: 'https://docs.cocos.com/creator/api/zh/'
}
/**
 * 快捷获取文档路径
 * @param relativeUrl 
 * @param type 
 */
export function getDocUrl(relativeUrl: string, type: 'manual' | 'api' = 'manual'): string {
    if (!relativeUrl) {
        return '';
    }
    return new URL(relativeUrl, urls[type]).href;
}
