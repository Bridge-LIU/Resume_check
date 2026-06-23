import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class name の合成ヘルパー。shadcn/ui で使う */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
