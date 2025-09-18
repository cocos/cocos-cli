// src/decorators.ts
import "reflect-metadata";
import { ZodType } from "zod";
import { createCommonResult } from "../base/scheme-base";

interface ParamSchema {
  index: number;
  schema: ZodType;
}

interface ToolMetaData {
  toolName: string;
  title?: string;
  description?: string;
  paramSchemas: ParamSchema[];
  returnSchema?: ZodType;
  methodName: string;
}

// 工具注册表，map from tool name → metadata + target class prototype + method
const toolRegistry = new Map<string, { target: any; meta: ToolMetaData }>();

// Method decorator：标注一个方法是 tool
export function Tool(toolName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const proto = target;
    // 获取已有 paramSchemas，title, description, returnSchema（如果有的话）
    const paramSchemas: ParamSchema[] =
      Reflect.getOwnMetadata(`tool:paramSchemas:${propertyKey}`, proto) || [];
    const returnSchema: ZodType | undefined =
      Reflect.getOwnMetadata(`tool:returnSchema:${propertyKey}`, proto);
    const title: string | undefined =
      Reflect.getOwnMetadata(`tool:title:${propertyKey}`, proto);
    const description: string | undefined =
      Reflect.getOwnMetadata(`tool:description:${propertyKey}`, proto);

    if (toolRegistry.has(toolName)) {
      throw new Error(`Tool name "${toolName}" is already registered`);
    }

    const meta: ToolMetaData = {
      toolName,
      title,
      description,
      paramSchemas,
      returnSchema,
      methodName: propertyKey,
    };
    toolRegistry.set(toolName, { target: proto, meta });
  };
}

// Description decorator
export function Description(desc: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(`tool:description:${propertyKey}`, desc, target);
  };
}

// Title decorator
export function Title(title: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(`tool:title:${propertyKey}`, title, target);
  };
}

// Param decorator (标注某个参数要用某个 Zod schema 验证)
export function Param(schema: ZodType) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const proto = target;
    const key = `tool:paramSchemas:${propertyKey.toString()}`;
    const existing: ParamSchema[] = Reflect.getOwnMetadata(key, proto) || [];
    existing.push({ index: parameterIndex, schema });
    Reflect.defineMetadata(key, existing, proto);
  };
}

// Result decorator（标注返回值 schema）
// 接受 returnType 参数，自动包装成 CommonResult 格式
export function Result(returnType: ZodType) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // 使用 createCommonResult 自动包装成 { code: number, data: returnType } 的格式
    const wrappedSchema = createCommonResult(returnType);
    Reflect.defineMetadata(`tool:returnSchema:${propertyKey}`, wrappedSchema, target);
  };
}

// 导出 registry
export { toolRegistry, ToolMetaData };