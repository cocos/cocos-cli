import URI from 'urijs';

export function convertsEncodedSeparatorsInURI(uri: URI) {
    let hasBackSlash = false;
    const segments = uri
        .pathname()
        .split('/')
        .map((x: string) => {
            const subsegs = decodeURIComponent(x).split(/[\\\/]/g); // eslint-disable-line no-useless-escape
            if (subsegs.length > 1) {
                hasBackSlash = true;
                return subsegs.map((subseg) => encodeURIComponent(subseg)).join('/');
            } else {
                return x;
            }
        });
    if (hasBackSlash) {
        uri.pathname(segments.join('/'));
    }
    return uri;
}
