
import * as React from "react"
import { cn } from "@/lib/utils"
import { useSidebar } from "./sidebar-context"

const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  const { isOpen } = useSidebar()

  return (
    <aside
      ref={ref}
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "fixed top-0 left-0 h-screen w-64 bg-edusign-600 text-white z-40 transition-transform lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        className
      )}
      {...props}
    />
  )
})
Sidebar.displayName = "Sidebar"

interface SidebarTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SidebarTrigger = ({ className, ...props }: SidebarTriggerProps) => {
  const { toggle } = useSidebar()

  return (
    <button
      className={cn("lg:hidden", className)}
      onClick={toggle}
      {...props}
    />
  )
}

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center h-16 px-4 border-b border-edusign-700", className)}
    {...props}
  />
))
SidebarHeader.displayName = "SidebarHeader"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 overflow-auto", className)}
    {...props}
  />
))
SidebarContent.displayName = "SidebarContent"

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-auto p-4 border-t border-edusign-700", className)}
    {...props}
  />
))
SidebarFooter.displayName = "SidebarFooter"

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-4", className)}
    {...props}
  />
))
SidebarInset.displayName = "SidebarInset"

const SidebarRail = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("w-16 h-screen p-2 bg-edusign-700", className)}
    {...props}
  />
))
SidebarRail.displayName = "SidebarRail"

const SidebarSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("h-px w-full bg-edusign-700 my-2", className)}
    {...props}
  />
))
SidebarSeparator.displayName = "SidebarSeparator"

const SidebarInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-edusign-700 bg-edusign-800 px-3 py-2 text-sm text-white placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
))
SidebarInput.displayName = "SidebarInput"

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
}
