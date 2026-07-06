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
    export const FilePicker: ComponentType<{
        value?: unknown;
        disabled?: boolean;
        filters?: Record<string, string[]>;
        accept?: string;
        buttonText?: string;
        placeholder?: string;
        onChange?: (value: unknown) => void;
        onValueChange?: (value: unknown) => void;
        [key: string]: unknown;
    }>;
}
