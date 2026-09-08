'use strict';

import { HingeJoint2D, js } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class HingeJoint2DGizmo extends Joint2DGizmo<HingeJoint2D> {}

export const name = js.getClassName(HingeJoint2D);
export const SelectGizmo = HingeJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
