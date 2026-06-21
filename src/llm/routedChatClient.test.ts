import assert from "node:assert/strict";
import {
  getRoutedChatModel,
  normalizeRoutedChatModel,
  resolveRoutedLlmGateway,
} from "./routedChatClient.js";

const savedEnv = {
  LLM_GATEWAY: process.env.LLM_GATEWAY,
  LLM_MODEL: process.env.LLM_MODEL,
  XH_MODEL: process.env.XH_MODEL,
  INFERAI_MODEL: process.env.INFERAI_MODEL,
};

delete process.env.LLM_GATEWAY;
delete process.env.LLM_MODEL;
delete process.env.XH_MODEL;
delete process.env.INFERAI_MODEL;

const defaultModel = getRoutedChatModel();

assert.equal(resolveRoutedLlmGateway(defaultModel), "inferaichat");
assert.equal(defaultModel, "inferaichat:deepseek-v4-flash");
assert.equal(normalizeRoutedChatModel(defaultModel), "deepseek-v4-flash");

process.env.LLM_GATEWAY = "xh";
assert.equal(resolveRoutedLlmGateway(), "xh");

for (const [key, value] of Object.entries(savedEnv)) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

console.log("routedChatClient tests passed");
