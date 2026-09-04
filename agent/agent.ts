import { createAsyncQueue } from "./queue.ts";
import {
  CompletionChoice,
  CompletionRequest,
  CompletionResponse,
  Message,
  ToolRegistry,
} from "./types.ts";

export type AgentContext = {
  push: (message: Message) => void;
  read: () => Message[];
  reset: () => void;
}

type AgentProps = {
  baseUrl: string;
  model: string;
  tools: ToolRegistry;
  context: AgentContext;
};

const fetchCompletion = async (
  baseUrl: string,
  request: CompletionRequest,
): Promise<CompletionResponse> => {
  const response = await fetch(new URL("v1/chat/completions", baseUrl), {
    method: "POST",
    body: JSON.stringify(request),
    headers: { "content-type": "application/json" },
  });
  return await response.json();
};

export const createAgent = (
  props: AgentProps,
  callbackFn: (event: Message, choice?: CompletionChoice) => void,
) => {
  const inputQueue = createAsyncQueue<Message>();

  const requestBase: Omit<CompletionRequest, "messages"> = {
    model: props.model ?? "",
    tools: Object.entries(props.tools).map(([name, { schema }]) => ({
      type: "function",
      function: {
        name,
        parameters: schema.toJSONSchema(),
      },
    })),
  };

  void (async () => {
    while (true) {
      // console.log('top of loop')
      const newMessages = await inputQueue.flush();
      for (const message of newMessages) {
        callbackFn(message);
        props.context.push(message);
      }

      const request: CompletionRequest = {
        ...requestBase,
        messages: props.context.read(),
        reasoning_effort: "none",
      };
      const completion = await fetchCompletion(props.baseUrl, request);

      if (!completion.choices) {
        console.log("no choices!");
        console.log(completion);
      }

      if (completion.choices.length > 1) {
        console.log("more than one choice"); // TODO: logging and handle multiple choices
        console.log(completion);
      }

      const choice0 = completion.choices[0];
      props.context.push(choice0.message);
      callbackFn(choice0.message, choice0);
      // console.log(choice0)

      if (choice0.message.tool_calls?.length) {
        for (const call of choice0.message.tool_calls) {
          // console.log(call);
          if (call.type !== "function") continue;
          const tool = props.tools[call.function.name];
          if (!tool) {
            inputQueue.push({
              role: "tool",
              content: `tool not found: ${call.function.name}`,
            });
            continue;
          }

          try {
            const input = JSON.parse(call.function.arguments);
            const args = tool.schema.parse(input);
            const result = await tool.fn(args);
            inputQueue.push({ role: "tool", content: result });
          } catch (e) {
            inputQueue.push({ role: "tool", content: `exception: ${e}` });
          }
        }
      }
    }
  })();

  return {
    send: (content: Message) => {
      inputQueue.push(content);
    },
    reset: () => {
      props.context.reset()
      inputQueue.reset();
    },
  };
};
