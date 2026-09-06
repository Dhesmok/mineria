import { cacheQueryResponse, getCachedQueryResponse, cacheTile, getCachedTile } from "./offlineCache"

describe("offlineCache", () => {
  it("se maneja sin fallos si indexedDB / window no están disponibles o devuelven nulo", async () => {
    await expect(cacheQueryResponse("test-key", { foo: "bar" })).resolves.not.toThrow()
    const result = await getCachedQueryResponse("test-key")
    expect(result).toBeNull()
  })

  it("se maneja sin fallos al interactuar con cacheTile / getCachedTile", async () => {
    const mockResponse = { clone: () => ({}) }
    await expect(cacheTile("https://example.com/tile.png", mockResponse)).resolves.not.toThrow()
    const tile = await getCachedTile("https://example.com/tile.png")
    expect(tile).toBeNull()
  })
})
