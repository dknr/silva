
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
export type JSONSchema = {
    type?: string;
    description?: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    [key: string]: unknown;
}
export type Tool = {
    name: string;
    parameters: JSONSchema;
    function: (args?: Map<string, unknown>) => Promise<string>;
}

export type CompletionRequest = {
    model: string;
    messages: Array<Message>;
    tools: Array<{
        type: 'function',
        function: {
            name: string;
            parameters: JSONSchema;
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