import { Archive } from '../../utils/migration-utils';

/**
 * Version: 3.5.0
 * Default: `Variable` -> `PlainVariable | TriggerVariable`
 */
export function migrateVariables(archive: Archive) {
    archive.visitTypedObject('cc.animation.Variable', (variableSerialized: OldVariableSerialized) => {
        switch (variableSerialized._type) {
            case VariableType.BOOLEAN:
            case VariableType.INTEGER:
            default: // Default to float
            case VariableType.FLOAT: {
                (variableSerialized as unknown as NewPlainVariableSerialized).__type__ = 'cc.animation.PlainVariable';
                break;
            }
            case VariableType.TRIGGER: {
                (variableSerialized as unknown as NewTriggerVariableSerialized).__type__ = 'cc.animation.TriggerVariable';
                delete variableSerialized._type;
                const value = variableSerialized._value;
                delete variableSerialized._value;
                if (typeof value !== 'undefined') {
                    (variableSerialized as unknown as NewTriggerVariableSerialized)._flags = value ? 1 : 0;
                }
                break;
            }
        }
    });
}

export enum VariableType {
    FLOAT = 0,
    BOOLEAN = 1,
    TRIGGER = 2,
    INTEGER = 3,
}

export interface OldVariableSerialized {
    __type__: 'cc.animation.Variable';
    _type?: VariableType;
    _value?: number | boolean;
}

export interface NewPlainVariableSerialized {
    __type__: 'cc.animation.PlainVariable';
    _type?: VariableType.BOOLEAN | VariableType.INTEGER | VariableType.FLOAT;
    _value?: number | boolean;
}

export interface NewTriggerVariableSerialized {
    __type__: 'cc.animation.TriggerVariable';
    _flags?: number;
}
