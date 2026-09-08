'use strict';

import { js, SliderJoint2D } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class SliderJoint2DGizmo extends Joint2DGizmo<SliderJoint2D> {}

export const name = js.getClassName(SliderJoint2D);
export const SelectGizmo = SliderJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
