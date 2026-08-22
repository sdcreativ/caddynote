import React from 'react';
import { Slot } from "@radix-ui/react-slot";
import { cn } from '@/lib/utils';
import { SidebarContext } from './sidebar-context';

// Utilisons directement SidebarContext au lieu de useSidebarContext
export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(SidebarContext);

  return (
    <div
      className={cn(
        "py-2",
        context?.isOpen === false && "px-2",
        context?.isOpen !== false && "px-3",
        className
      )}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(SidebarContext);

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center rounded-lg px-2 py-2 text-muted-foreground hover:bg-accent",
        className
      )}
      {...props}
    />
  );
}

export function SidebarMenuButton({
  className,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
}) {
  const context = React.useContext(SidebarContext);
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "flex w-full items-center gap-2 rounded-lg",
        context?.isOpen !== false && "justify-start",
        context?.isOpen === false && "justify-center",
        className
      )}
      {...props}
    />
  );
}

// Ajout des composants manquants
export function SidebarMenuAction({
  className,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn("ml-auto", className)} {...props} />;
}

export function SidebarMenuBadge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-auto", className)} {...props} />;
}

export function SidebarMenuSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-8 w-full animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function SidebarMenuSub({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-4 mt-2", className)} {...props} />;
}

export function SidebarMenuSubButton({
  className,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn("flex w-full items-center gap-2 rounded-lg", className)} {...props} />;
}

export function SidebarMenuSubItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("py-1", className)} {...props} />;
}
