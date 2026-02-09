import { describe, expect, it } from "bun:test";
import { getPlatformAdapter } from "../../src/cli/adapters/index.js";

describe("OpenCode adapter aliases", () => {
  it("maps 'opencode' payload fields like Claude Code format", () => {
    const adapter = getPlatformAdapter("opencode");
    const input = adapter.normalizeInput({
      session_id: "ses_123",
      cwd: "/tmp/project",
      tool_name: "Read",
      tool_input: { file_path: "README.md" },
      tool_response: { content: "ok" },
      transcript_path: "/tmp/transcript.jsonl",
    });

    expect(input.sessionId).toBe("ses_123");
    expect(input.cwd).toBe("/tmp/project");
    expect(input.toolName).toBe("Read");
    expect(input.transcriptPath).toBe("/tmp/transcript.jsonl");
  });

  it("supports 'oh-my-opencode' alias", () => {
    const adapter = getPlatformAdapter("oh-my-opencode");
    const input = adapter.normalizeInput({ session_id: "ses_omo" });

    expect(input.sessionId).toBe("ses_omo");
  });
});
