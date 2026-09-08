'use strict';

import { js, RelativeJoint2D } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class RelativeJoint2DGizmo extends Joint2DGizmo<RelativeJoint2D> {}

export const name = js.getClassName(RelativeJoint2D);
export const SelectGizmo = RelativeJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
