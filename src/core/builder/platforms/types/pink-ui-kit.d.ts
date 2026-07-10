declare module '@pink/ui-kit' {
    import type { ComponentType, ReactNode } from 'react';

    export const TypedField: ComponentType<{
        label: ReactNode;
        tooltip?: string;
        required?: boolean;
        children?: ReactNode;
        [key: string]: unknown;
    }>;

    export const Checkbox: ComponentType<{
        checked?: boolean;
        disabled?: boolean;
        onCheckedChange?: (checked: boolean) => void;
        [key: string]: unknown;
    }>;
}
