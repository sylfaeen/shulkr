import { loader, type Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { cn } from '@shulkr/frontend/lib/cn';

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

loader.config({ monaco });

export type { Monaco };

export const MONACO_THEME_LIGHT = 'shulkr-light';
export const MONACO_THEME_DARK = 'shulkr-dark';

export const SHARED_COLORS_LIGHT: Record<string, string> = {
  'editor.background': '#ffffff',
  'editor.foreground': '#1e1e1e',
  'editorGutter.background': '#ecefec',
  'editorLineNumber.foreground': '#8b949e',
  'editorLineNumber.activeForeground': '#1e1e1e',
  'editor.lineHighlightBackground': '#f6f8fa',
  'editor.lineHighlightBorder': '#00000000',
  'editorCursor.foreground': '#1e1e1e',
  'editor.selectionBackground': '#b4d7ff',
  'editor.inactiveSelectionBackground': '#b4d7ff80',
  'scrollbar.shadow': '#00000000',
  'scrollbarSlider.background': '#c1c1c140',
  'scrollbarSlider.hoverBackground': '#9e9e9e60',
  'scrollbarSlider.activeBackground': '#7e7e7e80',
};

export const SHARED_COLORS_DARK: Record<string, string> = {
  'editor.background': '#18181b',
  'editor.foreground': '#d4d4d4',
  'editorGutter.background': '#1e1e21',
  'editorLineNumber.foreground': '#525866',
  'editorLineNumber.activeForeground': '#d4d4d4',
  'editor.lineHighlightBackground': '#ffffff08',
  'editor.lineHighlightBorder': '#00000000',
  'editorCursor.foreground': '#d4d4d4',
  'editor.selectionBackground': '#264f78',
  'editor.inactiveSelectionBackground': '#264f7840',
  'scrollbar.shadow': '#00000000',
  'scrollbarSlider.background': '#4e4e4e40',
  'scrollbarSlider.hoverBackground': '#64646460',
  'scrollbarSlider.activeBackground': '#7e7e7e80',
};

export const MONACO_CONTAINER_CLASS = cn([
  '[&_.monaco-editor_.margin]:w-10!',
  '[&_.monaco-editor_.margin-view-overlays]:w-12.25!',
  '[&_.monaco-editor_.current-line-margin]:bg-transparent!',
  '[&_.monaco-editor_.line-numbers]:w-6! [&_.monaco-editor_.line-numbers]:text-right [&_.monaco-editor_.line-numbers]:text-[13px]!',
  '[&_.monaco-editor_.editor-scrollable]:left-12.25!',
]);

let themesRegistered = false;

export function registerMonacoThemes(instance: Monaco): void {
  if (themesRegistered) return;
  themesRegistered = true;

  instance.editor.defineTheme(MONACO_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: SHARED_COLORS_LIGHT,
  });

  instance.editor.defineTheme(MONACO_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: SHARED_COLORS_DARK,
  });
}
