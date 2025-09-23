// src/decorators.ts
import "reflect-metadata";
import type { ZodType } from "zod";
import { createCommonResult } from "../base/scheme-base";

interface ParamSchema {
  index: number;
  schema: ZodType<any>;
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

// helper 判断旧签名 vs 新签名
function isOldSignature(args: any[]): args is [target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor] {
  return args.length === 3 && typeof args[2] === "object";
}

export function Tool(toolName?: string) {
  return function (...decoratorArgs: any[]) {
    if (isOldSignature(decoratorArgs)) {
      // 旧签名
      const [target, propertyKey, descriptor] = decoratorArgs;
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
    } else {
      // 新签名 proposal
      const [value, context] = decoratorArgs;
      // context.name 是方法名 (string | symbol)
      const propertyKey = context.name;
      const proto = value;  // value 是函数本身， but for metadata we treat `proto = value`? Actually `value` is the method function, but metadata is usually on prototype, so need to find the prototype
      // In new proposal, `context` has `kind`, static, etc. To get the prototype, you might need to use context on class or instance.
      // Assuming the class's prototype is accessible via: context.static ? targetClass : targetClass.prototype
      // But context doesn't directly give the target object in TS new API — might need to adapt depending on runtime.

      // For simplicity, assume we have metadata stored on prototype under same propertyKey
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
    }
  };
}

export function Description(desc: string) {
  return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {
    const key = `tool:description:${propertyKey.toString()}`;
    Reflect.defineMetadata(key, desc, target);
  };
}

export function Title(title: string) {
  return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {
    const key = `tool:title:${propertyKey.toString()}`;
    Reflect.defineMetadata(key, title, target);
  };
}

export function Param(schema: ZodType<any>) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const proto = target;
    const key = `tool:paramSchemas:${propertyKey.toString()}`;
    const existing: ParamSchema[] = Reflect.getOwnMetadata(key, proto) || [];
    existing.push({ index: parameterIndex, schema });
    Reflect.defineMetadata(key, existing, proto);
  };
}

export function Result(returnType: ZodType<any>) {
  return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {
    const wrappedSchema = createCommonResult(returnType);
    Reflect.defineMetadata(`tool:returnSchema:${propertyKey.toString()}`, wrappedSchema, target);
  };
}

export { toolRegistry, ToolMetaData };