// src/decorators.ts
import 'reflect-metadata';
import type { ZodType } from 'zod';
import { createCommonResult } from '../base/schema-base';

interface ParamSchema {
  index: number;
  schema: ZodType<any>;
  name?: string;
}

interface ToolMetaData {
  toolName: string;
  title?: string;
  description?: string;
  paramSchemas: ParamSchema[];
  returnSchema?: ZodType<any>;
  methodName: string | symbol;
}

const toolRegistry = new Map<string, { target: any; meta: ToolMetaData }>();

export function tool(toolName?: string) {
  return function (...decoratorArgs: any[]) {
    const [target, propertyKey, _descriptor] = decoratorArgs;
    const proto = target;
    const name = toolName || propertyKey.toString();

    if (toolRegistry.has(name)) {
      throw new Error(`Tool name "${name}" is already registered`);
    }

    const paramSchemas: ParamSchema[] =
        Reflect.getOwnMetadata(`tool:paramSchemas:${propertyKey.toString()}`, proto) || [];

    const returnSchema: ZodType<any> | undefined =
        Reflect.getOwnMetadata(`tool:returnSchema:${propertyKey.toString()}`, proto);

    const title: string | undefined =
        Reflect.getOwnMetadata(`tool:title:${propertyKey.toString()}`, proto);

    const description: string | undefined =
        Reflect.getOwnMetadata(`tool:description:${propertyKey.toString()}`, proto);

    const meta: ToolMetaData = {
      toolName: name,
      title,
      description,
      paramSchemas,
      returnSchema,
      methodName: propertyKey
    };
    toolRegistry.set(name, { target: proto, meta });
  };
}

export function description(desc: string) {
  return function (target: any, propertyKey: string | symbol, _descriptor?: PropertyDescriptor) {
    const key = `tool:description:${propertyKey.toString()}`;
    Reflect.defineMetadata(key, desc, target);
  };
}

export function title(title: string) {
  return function (target: any, propertyKey: string | symbol, _descriptor?: PropertyDescriptor) {
    const key = `tool:title:${propertyKey.toString()}`;
    Reflect.defineMetadata(key, title, target);
  };
}

export function param(schema: ZodType<any>) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const proto = target;
    const key = `tool:paramSchemas:${propertyKey.toString()}`;
    const existing: ParamSchema[] = Reflect.getOwnMetadata(key, proto) || [];
    
    // 尝试获取参数名称
    const paramTypes = Reflect.getMetadata('design:paramtypes', target, propertyKey);
    const paramNames = getParameterNames(target[propertyKey]);
    const paramName = paramNames && paramNames[parameterIndex] ? paramNames[parameterIndex] : `param${parameterIndex}`;
    
    existing.push({ index: parameterIndex, schema, name: paramName });
    Reflect.defineMetadata(key, existing, proto);
  };
}

// 辅助函数：从函数中提取参数名称
function getParameterNames(func: Function): string[] | null {
  if (!func) return null;
  
  const funcStr = func.toString();
  const match = funcStr.match(/\(([^)]*)\)/);
  if (!match || !match[1]) return null;
  
  return match[1]
    .split(',')
    .map(param => param.trim().split(/\s+/)[0].split(':')[0].trim())
    .filter(name => name && name !== '');
}

export function result(returnType: ZodType<any>) {
  return function (target: any, propertyKey: string | symbol, _descriptor?: PropertyDescriptor) {
    const wrappedSchema = createCommonResult(returnType);
    Reflect.defineMetadata(`tool:returnSchema:${propertyKey.toString()}`, wrappedSchema, target);
  };
}

export { toolRegistry, ToolMetaData };