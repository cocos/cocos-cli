import { js, Vec3 } from 'cc';

/** Older engines serialize Vertex.coefficients without declaring its array element type. */
export function withLightProbeCoefficientType<T extends object>(
    attributes: T,
    owner: object | null,
    key?: string,
): T | (T & { ctor: typeof Vec3 }) {
    if ((!('ctor' in attributes) || !attributes.ctor) && key === 'coefficients' && owner && js.getClassName(owner) === 'cc.Vertex') {
        // Use the declared SH representation even for an empty/cleared array. Do not
        // mutate engine metadata or infer an arbitrary array's type from its first item.
        return { ...attributes, ctor: Vec3 };
    }
    return attributes;
}
