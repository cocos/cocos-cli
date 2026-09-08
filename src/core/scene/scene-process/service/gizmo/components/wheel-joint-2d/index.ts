'use strict';

import { js, WheelJoint2D } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class WheelJoint2DGizmo extends Joint2DGizmo<WheelJoint2D> {}

export const name = js.getClassName(WheelJoint2D);
export const SelectGizmo = WheelJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
