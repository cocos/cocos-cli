import { Archive } from '../../utils/migration-utils';

const TYPE_ID_BINARY_CONDITION = 'cc.animation.BinaryCondition';

export function migrateAnimationGraph_3_8_0(archive: Archive) {
    migrateTransitionBindings(archive);
}

/**
 * Version: 3.8.0
 *
 * Transition binding system: https://github.com/cocos/cocos-engine/pull/14857
 */
function migrateTransitionBindings(archive: Archive) {
    const animationGraphSerialized = (() => {
        let animationGraph:
            | undefined
            | Readonly<{
                  _variables: Record<
                      string,
                      {
                          __type__: 'cc.animation.PlainVariable';
                          _type?: number;
                      }
                  >;
              }>;

        archive.visitTypedObject('cc.animation.AnimationGraph', (serialized) => {
            if (animationGraph) {
                throw new Error('Migration error: the old serialized animation graph assets has more than one animation graph objects!');
            }
            animationGraph = serialized;
        });

        if (!animationGraph) {
            throw new Error('Migration error: the old serialized animation graph assets has no any animation graph object!');
        }

        return animationGraph;
    })();

    archive.visitTypedObject(TYPE_ID_BINARY_CONDITION, (oldSerialized: OldSerializedBinaryCondition) => {
        const { lhs: lhsOld, rhs: rhsOld, ...unchangedOld } = oldSerialized;

        if ((rhsOld.variable ?? '') !== '') {
            throw new Error(
                'Migration error: the old serialized binary condition is asserted to ' +
                    `have only constant value but instead saw ${rhsOld.variable}`,
            );
        }

        let lhsBindingValueType = TCBindingValueType.FLOAT;
        const lhsVariableDescription = animationGraphSerialized._variables[lhsOld.variable];
        if (!lhsVariableDescription) {
            console.debug(`The condition's lhs variable ${lhsOld.variable} was previously not bound.`);
        } else {
            enum ValidVariableType {
                FLOAT = 0,
                INTEGER = 3,
            }
            const PLAIN_VARIABLE_DESCRIPTION_DEFAULT_TYPE = 0;
            let isVariableTypeValid = false;
            if (lhsVariableDescription.__type__ === 'cc.animation.PlainVariable') {
                const variableTypeOld = lhsVariableDescription._type ?? PLAIN_VARIABLE_DESCRIPTION_DEFAULT_TYPE;
                if (variableTypeOld === ValidVariableType.FLOAT) {
                    lhsBindingValueType = TCBindingValueType.FLOAT;
                    isVariableTypeValid = true;
                } else if (variableTypeOld === ValidVariableType.INTEGER) {
                    lhsBindingValueType = TCBindingValueType.INTEGER;
                    isVariableTypeValid = true;
                }
            }
            if (!isVariableTypeValid) {
                console.debug(
                    `The condition's lhs variable ${lhsOld.variable} was previously ` +
                        `bound to a variable with mismatched type: ${JSON.stringify(lhsVariableDescription, undefined, 2)}`,
                );
            }
        }

        const newSerialized: NewSerializedBinaryCondition = {
            ...unchangedOld,
            lhs: lhsOld.value,
            lhsBinding: {
                __type__: 'cc.animation.TCVariableBinding',
                type: lhsBindingValueType,
                variableName: lhsOld.variable,
            },
            rhs: oldSerialized.rhs.value,
        };

        clearEntries(oldSerialized);
        Object.assign(oldSerialized, newSerialized);
    });
}

enum TCBindingValueType {
    FLOAT = 0 /* VariableType.FLOAT */,
    INTEGER = 3 /* VariableType.INTEGER */,
}

interface BindableNumber {
    __type__: 'cc.animation.BindableNumber';
    variable: string;
    value: number;
}

interface OldSerializedBinaryCondition {
    __type__: typeof TYPE_ID_BINARY_CONDITION;
    lhs: BindableNumber;
    rhs: BindableNumber;
}

interface NewSerializedBinaryCondition {
    __type__: typeof TYPE_ID_BINARY_CONDITION;
    lhs?: number;
    lhsBinding: {
        __type__: 'cc.animation.TCVariableBinding';
        type: TCBindingValueType;
        variableName: string;
    };
    rhs?: number;
}

function clearEntries(obj: object) {
    for (const k in obj) {
        delete (obj as any)[k];
    }
}
