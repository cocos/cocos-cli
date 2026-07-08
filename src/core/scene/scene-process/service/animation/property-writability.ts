export function isWritableProperty(target: object, key: string): boolean {
    const descriptor = findPropertyDescriptor(target, key);
    if (!descriptor) {
        return true;
    }
    if (isAccessorDescriptor(descriptor)) {
        return typeof descriptor.set === 'function';
    }
    return descriptor.writable !== false;
}

function findPropertyDescriptor(target: object, key: string): PropertyDescriptor | undefined {
    let current: object | null = target;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) {
            return descriptor;
        }
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}

function isAccessorDescriptor(descriptor: PropertyDescriptor): boolean {
    return Object.prototype.hasOwnProperty.call(descriptor, 'get')
        || Object.prototype.hasOwnProperty.call(descriptor, 'set');
}
