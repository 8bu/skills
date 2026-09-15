/**
 * prompt-repeat — an OMP extension.
 *
 * For `task` subagents that run on `deepseek/deepseek-flash` (any thinking
 * level), send the latest user/task message twice to the model:
 *
 *   <original task>
 *
 *   <original task>
 *
 * The change lives only in the transient LLM context of one request. Session
 * history, system prompts, tool schemas, images and earlier messages are not
 * touched. Other agents and other models are not affected.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const AGENT = "task";
const SEPARATOR = "\n\n";

type TextPart = { type: "text"; text: string };
type Part = TextPart | { type: string };
type UserMessage = { role: "user"; content: string | Part[] };

function isTextPart(part: Part): part is TextPart {
	return part.type === "text";
}

function isRepeated(text: string): boolean {
	const half = (text.length - SEPARATOR.length) / 2;
	return (
		Number.isInteger(half) &&
		half > 0 &&
		text.slice(half, half + SEPARATOR.length) === SEPARATOR &&
		text.slice(0, half) === text.slice(half + SEPARATOR.length)
	);
}

/** Return a copy of `message` with its text repeated once, or `undefined` when nothing changes. */
export function repeatUserText(message: UserMessage): UserMessage | undefined {
	if (typeof message.content === "string") {
		const text = message.content;
		if (text.length === 0 || isRepeated(text)) return undefined;
		return { ...message, content: text + SEPARATOR + text };
	}
	const textParts = message.content.filter(isTextPart);
	if (textParts.length === 0) return undefined;
	const text = textParts.map(part => part.text).join(SEPARATOR);
	if (text.length === 0 || isRepeated(text)) return undefined;
	const last = textParts[textParts.length - 1];
	const content = message.content.map(part =>
		part === last ? { ...last, text: last.text + SEPARATOR + text } : part,
	);
	return { ...message, content };
}

export default function deepseekRepeatTask(pi: ExtensionAPI) {
	pi.on("context", (event, ctx) => {
		const model = ctx.model;
		if (!model || model.provider !== PROVIDER || model.id !== MODEL_ID) return;

		// Subagent sessions carry a `session_init` entry naming the agent definition.
		// Main sessions have none, so they never match.
		const init = ctx.sessionManager.getEntries().find(entry => entry.type === "session_init");
		if (!init || init.agent !== AGENT) return;

		const messages = event.messages;
		for (let index = messages.length - 1; index >= 0; index--) {
			const message = messages[index];
			if (message.role !== "user") continue;
			const repeated = repeatUserText(message as UserMessage);
			if (!repeated) return;
			const next = messages.slice();
			next[index] = repeated as typeof message;
			return { messages: next };
		}
	});
}
