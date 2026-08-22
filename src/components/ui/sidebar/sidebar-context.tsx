
import { createContext, useContext, useState } from "react"

interface SidebarContextProps {
  isOpen: boolean
  toggle: () => void
  expand: () => void
  collapse: () => void
}

export const SidebarContext = createContext<SidebarContextProps>({
  isOpen: true,
  toggle: () => {},
  expand: () => {},
  collapse: () => {},
})

interface SidebarProviderProps {
  children: React.ReactNode
  defaultIsOpen?: boolean
}

export function SidebarProvider({
  children,
  defaultIsOpen = true,
}: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultIsOpen)

  const toggle = () => {
    setIsOpen(!isOpen)
  }

  const expand = () => {
    setIsOpen(true)
  }

  const collapse = () => {
    setIsOpen(false)
  }

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle,
        expand,
        collapse,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }

  return context
}
