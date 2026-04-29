import { createContext, use, useState, useEffect, useRef, PropsWithChildren } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SidebarNavChild = {
  key: string;
  path: string;
  exact?: boolean;
  label?: string;
};

export type SidebarNavItem = {
  key: string;
  path: string;
  exact?: boolean;
  icon: LucideIcon;
  bottom?: boolean;
  children?: Array<SidebarNavChild>;
};

export type SidebarNavSection = {
  section?: string;
  items: Array<SidebarNavItem>;
};

type SidebarHeader = {
  backPath: string;
  backLabel: string;
};

type SidebarContextValue = {
  sections: Array<SidebarNavSection>;
  setSections: (sections: Array<SidebarNavSection>) => void;
  header: SidebarHeader | null;
  setHeader: (header: SidebarHeader | null) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ ...rest }: PropsWithChildren) {
  const [sections, setSections] = useState<Array<SidebarNavSection>>([]);
  const [header, setHeader] = useState<SidebarHeader | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  return <SidebarContext value={{ sections, setSections, header, setHeader, mobileOpen, setMobileOpen }} {...rest} />;
}

export function useSidebar() {
  const ctx = use(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export function useSidebarItems(sections: Array<SidebarNavSection>, header?: SidebarHeader) {
  const { setSections, setHeader } = useSidebar();
  const keyRef = useRef('');
  useEffect(() => {
    const key = sections
      .flatMap((s) => s.items)
      .map((i) => {
        const childKeys = i.children?.map((c) => c.key + ':' + c.path).join(',') ?? '';
        return i.key + ':' + i.path + '[' + childKeys + ']';
      })
      .join('|');
    if (key !== keyRef.current) {
      keyRef.current = key;
      setSections(sections);
    }
  }, [sections, setSections]);
  const backPath = header?.backPath;
  const backLabel = header?.backLabel;
  useEffect(() => {
    setHeader(backPath && backLabel ? { backPath, backLabel } : null);
    return () => setHeader(null);
  }, [backPath, backLabel, setHeader]);
}
