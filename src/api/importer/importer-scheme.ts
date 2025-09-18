import { z } from 'zod';

export const uriPath = z.string().describe('uri path');
export type TypeUriPath = z.infer<typeof uriPath>;

export const queryResult = z.object({
    url: z.string().describe('url'),
}).describe('query url result');
export type TypeQueryResult = z.infer<typeof queryResult>;