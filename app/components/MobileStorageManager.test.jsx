import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MobileStorageManager } from "./MobileStorageManager"
import { getStorageStatus, clearManagedTileCache } from "../utils/offlineCache"

jest.mock("../hooks/usePwaInstall", () => ({
  usePwaInstall: () => ({
    canInstall: true,
    isInstalled: false,
    isIOS: false,
    promptInstall: jest.fn().mockResolvedValue(true),
  }),
}))

jest.mock("../utils/offlineCache", () => ({
  getStorageStatus: jest.fn(),
  clearManagedTileCache: jest.fn(),
}))

describe("MobileStorageManager", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("renderiza el bloque de instalación y almacenamiento", async () => {
    getStorageStatus.mockResolvedValue({
      supported: true,
      originUsageBytes: 5242880, // 5 MB
      originQuotaBytes: 104857600, // 100 MB
      managedCacheBytes: 2097152, // 2 MB
      managedCacheEntries: 64,
    })

    render(<MobileStorageManager />)

    expect(screen.getByText("Aplicación Móvil")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Instalar visor en el teléfono/i })).toBeInTheDocument()
    expect(screen.getByText("Memoria y Almacenamiento")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Liberar memoria de mapas/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("2.0 MB")).toBeInTheDocument()
      expect(screen.getByText("64 teselas")).toBeInTheDocument()
    })
  })

  test("muestra confirmación al pulsar liberar memoria y ejecuta clearManagedTileCache", async () => {
    const user = userEvent.setup()
    clearManagedTileCache.mockResolvedValue({ success: true })
    getStorageStatus.mockResolvedValue({
      supported: true,
      originUsageBytes: 1024,
      originQuotaBytes: 10485760,
      managedCacheBytes: 1024,
      managedCacheEntries: 1,
    })

    render(<MobileStorageManager />)

    const freeBtn = screen.getByRole("button", { name: /Liberar memoria de mapas/i })
    await user.click(freeBtn)

    expect(screen.getByText(/Se borrarán mapas y elevaciones temporales/i)).toBeInTheDocument()

    const confirmBtn = screen.getByRole("button", { name: /Sí, liberar/i })
    await user.click(confirmBtn)

    expect(clearManagedTileCache).toHaveBeenCalledTimes(1)
  })
})
