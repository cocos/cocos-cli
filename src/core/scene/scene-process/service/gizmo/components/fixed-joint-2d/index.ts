'use strict';

import { FixedJoint2D, js } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class FixedJoint2DGizmo extends Joint2DGizmo<FixedJoint2D> {}

export const name = js.getClassName(FixedJoint2D);
export const SelectGizmo = FixedJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
