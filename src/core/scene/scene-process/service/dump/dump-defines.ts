import { realCurveDump } from './types/real-curve-dump';
import { animationCurveDump } from './types/animation-curve-dump';
import { assetDump } from './types/asset-dump';
import { componentDump } from './types/component-dump';
import { DumpInterface } from './types/dump-interface';
import { gradientDump } from './types/gradient-dump';
import { nodeDump } from './types/node-dump';
import { numberDump } from './types/number-dump';
import { stringDump } from './types/string-dump';
import { valueTypeDump } from './types/value-type-dump';
import { typedArrayDump } from './types/typed-array-dump';

const DumpDefines: { [key: string]: DumpInterface } = {};
DumpDefines['cc.Gradient'] = gradientDump;
DumpDefines['cc.ValueType'] = valueTypeDump;
DumpDefines['cc.AnimationCurve'] = animationCurveDump;
DumpDefines['cc.RealCurve'] = realCurveDump;
DumpDefines['cc.Node'] = nodeDump;
DumpDefines['cc.Component'] = componentDump;
DumpDefines['cc.Asset'] = assetDump;
// tslint:disable-next-line:no-string-literal
DumpDefines['Number'] = numberDump;
// tslint:disable-next-line:no-string-literal
DumpDefines['Enum'] = numberDump;
// tslint:disable-next-line:no-string-literal
DumpDefines['String'] = stringDump;
DumpDefines['TypedArray'] = typedArrayDump;

export { DumpDefines };
