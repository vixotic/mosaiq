import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzerError } from "./analyzer.types.js";
import { OllamaImageAnalyzer } from "./ollama-image-analyzer.js";

describe("OllamaImageAnalyzer", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "test-vision";
    process.env.OLLAMA_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks that the configured model is installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ models: [{ name: "test-vision:latest" }] }), {
          status: 200,
        }),
      ),
    );

    await expect(new OllamaImageAnalyzer().healthCheck()).resolves.toMatchObject({
      configured: true,
      available: true,
      model: "test-vision",
    });
  });

  it("sends an image and parses a partial structured result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response:
            '```json\\n{"title":"Editorial layout","tags":["poster"],"inspirationReasons":["Strong type scale"]}\\n```',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OllamaImageAnalyzer().analyze({
      image: Buffer.from("image"),
      mimeType: "image/jpeg",
      filename: "poster.jpg",
    });

    expect(result.title).toBe("Editorial layout");
    expect(result.styles).toEqual([]);
    expect(result.tags).toEqual(["poster"]);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe("test-vision");
    expect(request.images).toEqual([Buffer.from("image").toString("base64")]);
    expect(request.stream).toBe(false);
  });

  it("classifies server failures as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 })),
    );

    try {
      await new OllamaImageAnalyzer().analyze({
        image: Buffer.from("image"),
        mimeType: "image/jpeg",
        filename: "poster.jpg",
      });
      throw new Error("Expected analyze to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(AnalyzerError);
      expect((error as AnalyzerError).retryable).toBe(true);
    }
  });
});
