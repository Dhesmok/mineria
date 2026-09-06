import { renderHook, act } from "@testing-library/react"
import { usePwaInstall } from "./usePwaInstall"

describe("usePwaInstall", () => {
  beforeEach(() => {
    // Reset matchMedia
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }))
  })

  test("inicia como no instalada en navegador web normal", () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.isInstalled).toBe(false)
    expect(result.current.canInstall).toBe(false)
  })

  test("detecta el evento beforeinstallprompt y habilita canInstall", () => {
    const { result } = renderHook(() => usePwaInstall())

    const mockPromptEvent = new Event("beforeinstallprompt")
    mockPromptEvent.prompt = jest.fn()
    mockPromptEvent.userChoice = Promise.resolve({ outcome: "accepted" })

    act(() => {
      window.dispatchEvent(mockPromptEvent)
    })

    expect(result.current.canInstall).toBe(true)
  })

  test("promptInstall ejecuta el prompt y actualiza el estado a instalada", async () => {
    const { result } = renderHook(() => usePwaInstall())

    const mockPromptEvent = new Event("beforeinstallprompt")
    mockPromptEvent.prompt = jest.fn()
    mockPromptEvent.userChoice = Promise.resolve({ outcome: "accepted" })

    act(() => {
      window.dispatchEvent(mockPromptEvent)
    })

    let success
    await act(async () => {
      success = await result.current.promptInstall()
    })

    expect(mockPromptEvent.prompt).toHaveBeenCalled()
    expect(success).toBe(true)
    expect(result.current.isInstalled).toBe(true)
  })
})
