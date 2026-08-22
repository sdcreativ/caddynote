
import { ReactNode } from "react"

export type SidebarState = "expanded" | "collapsed"
export type SidebarCollapsible = "offcanvas" | "icon" | "none"
export type SidebarVariant = "sidebar" | "floating" | "inset"
export type SidebarSide = "left" | "right"

export interface SidebarContextType {
  state: SidebarState
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

export interface SidebarProviderProps {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export interface SidebarProps {
  side?: SidebarSide
  variant?: SidebarVariant
  collapsible?: SidebarCollapsible
  className?: string
  children?: ReactNode
}

export interface SidebarMenuButtonProps {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<any>
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  className?: string
}

export interface SidebarMenuActionProps {
  asChild?: boolean
  showOnHover?: boolean
  className?: string
}

export interface SidebarMenuSkeletonProps {
  showIcon?: boolean
  className?: string
}

