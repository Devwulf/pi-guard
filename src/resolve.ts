import type { CommandRef } from "./types.ts";

export function getCommandName(cmd: CommandRef): string {
	return cmd.node.name?.value ?? cmd.node.name?.text ?? "";
}

export function getCommandArgs(cmd: CommandRef): string[] {
	return cmd.node.suffix.map((word) => word.value ?? word.text);
}
