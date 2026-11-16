import { resolve } from 'path';
import type * as CcBuild from '@cocos/ccbuild';

// ccbuild 2.3.19 exports only its root, which eagerly loads the engine builder,
// Rollup and Babel. Resolve its shipped StatsQuery module from that entry.
const entry = require.resolve('@cocos/ccbuild');
export const { StatsQuery } = require(resolve(entry, '../../../modules/stats-query/lib/index.js')) as Pick<typeof CcBuild, 'StatsQuery'>;
export type StatsQuery = CcBuild.StatsQuery;
