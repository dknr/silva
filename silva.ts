import { Bot } from "gramio";
import z from "zod";

import { createAgent, Tool, tool, ToolRegistry } from "./agent/mod.ts";
import { AgentContext } from "./agent/agent.ts";
import { Message } from "./agent/types.ts";

const time = tool(z.object(), () => {
  const now = new Date();
  //   now.setFullYear(2051);
  //   now.setMonth(2);
  return Promise.resolve(now.toISOString());
});
const curl: Tool = tool(
  z.object({ url: z.string() }),
  async ({ url }) => {
    console.log("curl", url);
    const result = await fetch(url);

    const contentType = result.headers.get("content-type");
    if (!contentType?.startsWith("text")) {
      throw new Error(`content type not allowed: ${contentType}`);
    }

    // TODO: check content-length too
    const text = await result.text();
    return text.slice(0, 1e5);
  },
);

const bash = tool(
  z.object({ command: z.string() }),
  async ({ command }) => {
    const result = await Deno.spawnAndWait("bash", ["-c", command]);
    return JSON.stringify(
      {
        command,
        code: result.code,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      },
      null,
      2,
    );
  },
);

const simpleContext = (init?: () => Message[]): AgentContext => {
    let context: Message[] = init?.() ?? [];
    return {
        push: (message) => context.push(message),
        read: () => context,
        reset: () => {context = init?.() ?? []}
    }
}

const tools: ToolRegistry = {
  time,
  agent: tool(
    z.object({ prompt: z.string() }),
    ({ prompt }) =>
      new Promise((resolve) => {
        const subagent = createAgent({
          baseUrl: "http://10.11.116.184:8002",
          model: "",
          tools: {
            time,
            curl,
          },
          context: simpleContext(),
        }, (_, c) => {
          if (c?.finish_reason === "stop") {
            resolve(c.message.content);
          }
        });
        subagent.send({ role: "user", content: prompt });
      }),
  ),
};

const allowedId = parseInt(Deno.env.get("TG_ALLOWED_ID") ?? "", 10);
if (!allowedId) throw new Error();

const bot = new Bot(Deno.env.get("TG_TOKEN") ?? "");
bot.on("message", (context) => {
  if (context.from.id !== allowedId) return;
  if (!context.hasText()) return;
  //   console.log(context.text);

  if (context.text === "/reset") {
    agent.reset();
    return;
  }

  agent.send({ role: "user", content: context.text });
});

bot.start();
bot.api.sendMessage({ chat_id: allowedId, text: "bot started" });

const agent = createAgent({
  baseUrl: "http://10.11.116.184:8002",
  model: "",
  tools,
  context: simpleContext(() => [{role: 'system', content: "Check the time. There's lots to do, but don't rush. Be precise. You are fallible, so check sources rather than assume. You're an autonomous agent. You have agency. Use it!"}]),
}, (e) => {
  try {
    if (e.role === "assistant" && e.content) {
      bot.api.sendMessage({ chat_id: allowedId, text: e.content });
    }
    console.log(e);
    // if (e.tool_calls?.length) {
    //     console.log('🔨', e.tool_calls[0].function.name, e.tool_calls[0].function.arguments);
    // } else if (e.role === 'tool') {
    //     // no-op
    // } else {
    //     console.log(e.role, e.content)
    // }
  } catch {
    console.log(e);
  }
});
