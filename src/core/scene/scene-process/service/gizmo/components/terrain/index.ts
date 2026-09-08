'use strict';

import { js, Terrain } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import TerrainGizmo from './gizmo-select';
import TerrainPersistentGizmo from './gizmo-persistent';

export const name = js.getClassName(Terrain);
export const SelectGizmo = TerrainGizmo;
export const IconGizmo = null;
export const PersistentGizmo = TerrainPersistentGizmo;

registerGizmo(name, { SelectGizmo, PersistentGizmo });
