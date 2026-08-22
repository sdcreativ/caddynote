
// This file should export from hooks/use-toast.ts, but we need to fix
// the circular dependency issue
import { useToast as useToastHook, toast as toastFunction } from "@/hooks/use-toast";

export const useToast = useToastHook;
export const toast = toastFunction;
