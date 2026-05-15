import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { searchDocuments, crossReferenceProjects, summariseProject, compareApproaches } from "./tools";
import { buildPersonaPrompt } from "@/lib/persona";

const tools = [searchDocuments, crossReferenceProjects, summariseProject, compareApproaches];

export async function createESAIAgent(context: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    temperature: 0.3,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", buildPersonaPrompt(context)],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    tools,
    verbose: false,
    maxIterations: 5,
  });
}
