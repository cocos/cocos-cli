declare namespace JSX {
    interface IntrinsicElements {
        [elemName: string]: any;
    }
}

declare module 'react' {
    export type ReactNode = any;
    export type CSSProperties = Record<string, string | number | undefined>;
    export type ComponentType<P = Record<string, unknown>> = (props: P) => any;
    export interface ChangeEvent<T = { value?: string }> {
        target: T;
    }
    export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
    export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T;
    export function useRef<T>(initial: T): { current: T };
    export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
}

declare module 'react/jsx-runtime' {
    export const jsx: any;
    export const jsxs: any;
    export const Fragment: any;
}
