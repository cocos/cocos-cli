// https://stackoverflow.com/questions/12710001/how-to-convert-uint8-array-to-base64-encoded-string

export function decodeBase64ToArrayBuffer(base64: string) {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

export function encodeArrayBufferToBase64(bytes: Uint8Array) {
    // @ts-ignore TS2345
    return btoa(String.fromCharCode.apply(null, bytes));
}
