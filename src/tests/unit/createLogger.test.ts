import { describe, expect, it } from "vitest";
import { createLogger } from "../../infrastructure/createLogger.js";
import { runWithRequestContext } from "../../infrastructure/requestContext.js";

const createCapturingLogger = (level: "info" | "error" = "info") => {
  const lines: string[] = [];

  const logger = createLogger(
    { level },
    {
      write: (line) => {
        lines.push(line);
      },
    },
  );

  const entries = () =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  return { entries, logger };
};

describe("createLogger", () => {
  it("writes the level as text with a timestamp and message", () => {
    const { entries, logger } = createCapturingLogger();

    logger.info("Hello", { noteId: "1" });

    expect(entries()).toEqual([
      {
        level: "info",
        message: "Hello",
        noteId: "1",
        timestamp: expect.any(String),
      },
    ]);
  });

  it("serializes errors with their message and stack", () => {
    const { entries, logger } = createCapturingLogger();

    logger.error("Failed", { error: new Error("the real cause") });

    expect(entries()[0]?.error).toMatchObject({
      message: "the real cause",
      stack: expect.stringContaining("the real cause"),
    });
  });

  it("does not let metadata overwrite reserved fields", () => {
    const { entries, logger } = createCapturingLogger();

    logger.info("Original", { level: "error", message: "Overwritten" });

    expect(entries()[0]).toMatchObject({
      level: "info",
      message: "Original",
    });
  });

  it("adds the request ID from the request context", () => {
    const { entries, logger } = createCapturingLogger();

    runWithRequestContext({ requestId: "request-1" }, () => {
      logger.info("Inside request");
    });

    expect(entries()[0]?.requestId).toBe("request-1");
  });

  it("skips messages below the configured level", () => {
    const { entries, logger } = createCapturingLogger("error");

    logger.info("Ignored");

    expect(entries()).toEqual([]);
  });
});
