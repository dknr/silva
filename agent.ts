import { createAsyncQueue } from "./queue.ts";
import { Tool, CompletionRequest, CompletionResponse, Message } from "./types.ts";

type AgentProps = {
    baseUrl: string;
    model: string;
    tools?: Tool[];
}

const fetchCompletion = async (baseUrl: string, request: CompletionRequest): Promise<CompletionResponse> => {
    const response = await fetch(new URL('v1/chat/completions', baseUrl), {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {'content-type': 'application/json'}
    });
    return await response.json();
}

export const createAgent = (props: AgentProps, callbackFn: (event: Message) => void) => {
    const inputQueue = createAsyncQueue<Message>();
    const messages: Array<Message> = [];

    void (async () => {
        while (true) {
            // console.log('top of loop')
            const newMessages = await inputQueue.flush()
            for (const message of newMessages) {
                callbackFn(message);
                messages.push(message);
            }

            const request: CompletionRequest = {
                model: props.model,
                messages,
                tools: props.tools?.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        parameters: t.parameters,
                    }
                })) ?? [],
                reasoning_effort: 'none'
            }
            const completion = await fetchCompletion(props.baseUrl, request);

            if (!completion.choices) {
                console.log('no choices!')
                console.log(completion);
            }

            if (completion.choices.length > 1) {
                console.log('more than one choice') // TODO: logging and handle multiple choices
                console.log(completion);
            }

            const choice0 = completion.choices[0];
            messages.push(choice0.message);
            callbackFn(choice0.message)
            // console.log(choice0)

            if (choice0.message.tool_calls?.length) {
                for (const call of choice0.message.tool_calls) {
                    // console.log(call);
                    if (call.type !== 'function') continue;
                    // TODO: error prone variable names - see global `tools`
                    const tool = props.tools?.find((t) => t.name === call.function.name)
                    if (!tool) {
                        inputQueue.push({role: 'tool', content: `tool not found: ${call.function.name}`})
                        continue;
                    }

                    try {
                        const args = JSON.parse(call.function.arguments);
                        const result = await tool.function(args);
                        // console.log(call.function.name, result);
                        inputQueue.push({role: 'tool', content: result});
                    } catch (e) {
                        inputQueue.push({role: 'tool', content: `exception: ${e}`});
                    }
                }
            }
        }
    })();

    return {
        send: (content: string) => {
            inputQueue.push({role: 'user', content});
        }
    }
}