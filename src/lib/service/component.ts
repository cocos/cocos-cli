/**
 * Component service entry.
 *
 * Importing this module runs the service's `@register('Component')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Component } from '<cli>/lib/service/component';
 *   await Component.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/component';

export const Component = Service.Component;
