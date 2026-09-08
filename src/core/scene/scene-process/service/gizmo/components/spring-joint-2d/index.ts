'use strict';

import { js, SpringJoint2D } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class SpringJoint2DGizmo extends Joint2DGizmo<SpringJoint2D> {}

export const name = js.getClassName(SpringJoint2D);
export const SelectGizmo = SpringJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
