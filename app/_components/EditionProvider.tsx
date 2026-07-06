"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Edition } from "@/lib/edition";

const EditionContext = createContext<Edition>("lite");

export function EditionProvider({
  edition,
  children,
}: {
  edition: Edition;
  children: ReactNode;
}) {
  return (
    <EditionContext.Provider value={edition}>{children}</EditionContext.Provider>
  );
}

export function useEdition(): Edition {
  return useContext(EditionContext);
}

export function useIsFullEdition(): boolean {
  return useContext(EditionContext) === "full";
}
