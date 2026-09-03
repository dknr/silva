import * as z from 'zod';

export type ToolCall = {
    type: string; // expect 'function'
    function: {
        name: string;
        arguments: string;
    }
    id: string;
}
export type Message = {
    role: string;
    content: string;
    reasoning_content?: string;
    tool_calls?: ToolCall[];
}

export type Tool<T extends z.ZodType = z.ZodType> = {
    schema: T;
    fn: (args: z.infer<T>) => Promise<string>;
}
export type ToolRegistry = Record<string, Tool>;

export const tool = <T extends z.ZodType>(schema: T, fn: (args: z.infer<T>) => Promise<string>): Tool<T> => ({schema, fn});


export type CompletionRequest = {
    model: string;
    messages: Array<Message>;
    tools: Array<{
        type: 'function',
        function: {
            name: string;
            parameters: unknown;
        }
    }>;
    reasoning_effort?: string;
}

export type CompletionChoice = {
    finish_reason: string;
    index: number;
    message: Message;
}
export type CompletionResponse = {
    choices: CompletionChoice[];
}