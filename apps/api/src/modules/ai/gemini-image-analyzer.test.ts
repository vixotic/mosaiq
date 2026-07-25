import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiImageAnalyzer } from "./gemini-image-analyzer.js";

describe("GeminiImageAnalyzer", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.GEMINI_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the configured model without exposing the API key in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GeminiImageAnalyzer().healthCheck()).resolves.toMatchObject({
      configured: true,
      available: true,
      model: "gemini-2.5-flash",
    });

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).not.toContain("test-key");
    expect(new Headers(request.headers).get("x-goog-api-key")).toBe("test-key");
  });

  it("sends inline image data with a structured response schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Earthy editorial page",
                      description: "A restrained layout with soft natural colours.",
                      tags: ["editorial web design"],
                      inspirationReasons: [
                        "Strong contrast between serif display type and whitespace",
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GeminiImageAnalyzer().analyze({
      image: Buffer.from("image"),
      mimeType: "image/jpeg",
      filename: "reference.jpg",
    });

    expect(result.title).toBe("Earthy editorial page");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.contents[0].parts[1].inlineData.data).toBe(
      Buffer.from("image").toString("base64"),
    );
    expect(request.generationConfig.responseMimeType).toBe("application/json");
    expect(request.generationConfig.responseSchema.required).toContain("inspirationReasons");
    expect(JSON.stringify(request.generationConfig.responseSchema)).not.toContain(
      "additionalProperties",
    );
  });

  it("treats rate limits as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
    );

    await expect(
      new GeminiImageAnalyzer().analyze({
        image: Buffer.from("image"),
        mimeType: "image/jpeg",
        filename: "reference.jpg",
      }),
    ).rejects.toMatchObject({ retryable: true });
  });
});
