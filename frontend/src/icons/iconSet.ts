// Icon set externalized so you can edit or replace manually.
// Each entry maps a logical name to raw SVG inner markup (no <svg> wrapper).
// Feel free to swap with Heroicons, Lucide, custom art, etc.
export interface IconDefinition { svg: string; viewBox?: string }

export const iconSet: Record<string, IconDefinition> = {
  // Core tools (placeholders - replace as desired)
  select: { svg: '<path d="M5 3.5 12 15l1-5 6 1.2L5 3.5Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  ruler: { svg: '<rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" /><path d="M7 7v10M11 7v5M15 7v10M19 7v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />' },
  cone: { svg: '<path d="M12 4 20 20H4L12 4Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  circle: { svg: '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.6" fill="none" />' },
  square: { svg: '<rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" />' },
  line: { svg: '<path d="M5 19 19 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />' },
  beam: { svg: '<path d="M6 5h8l4 5v9H6V5Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  pin: { svg: '<path d="M12 21s6-5.5 6-9.8A6 6 0 0 0 6 11.2C6 15.5 12 21 12 21Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  delete: { svg: '<path d="M6 7h12M10 7V5h4v2m-6 0v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />' },
  aura: { svg: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" fill="none" /><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 4" fill="none" />' },
  auraRemove: { svg: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" fill="none" /><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />' },
  clear: { svg: '<path d="M5 5h6l2 3h6v2H5V5Zm2 5v9h10v-9" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none" />' },
  color: { svg: '<path d="M12 3c5 0 9 3.5 9 8 0 3.3-2.7 5-6 5h-1.5a1.5 1.5 0 0 0 0 3h.25c.7 0 1.25.55 1.25 1.25S14.45 21.5 13.75 21.5H13c-2.8 0-5-2.2-5-5v-.25c0-.7-.55-1.25-1.25-1.25H6c-1.7 0-3-1.6-3-3.5C3 6.5 7 3 12 3Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" />' },
  collapse: { svg: '<path d="M7 8h10M7 12h10M7 16h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />' },
  edit: { svg: '<path d="M4 16.8V20h3.2L17.7 9.5a2.1 2.1 0 0 0 0-3L15.5 4.3a2.1 2.1 0 0 0-3 0L4 12.8v4Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  copy: { svg: '<path d="M8 3h8a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  users: { svg: '<path d="M9 12a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" stroke="currentColor" stroke-width="1.6" fill="none" /><path d="M2.5 19.4c.6-3.5 3.7-5.4 6.5-5.4s5.9 1.9 6.5 5.4M13 17.7c.7-2.3 2.6-3.7 4.9-3.7 2.2 0 4.2 1.6 4.9 3.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />' },
  exit: { svg: '<path d="M4 4h8v4H8v8h4v4H4V4Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" /><path d="M12 12h10m0 0-3-3m3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />' },
  drag: { svg: '<path d="M9 5h0M15 5h0M9 12h0M15 12h0M9 19h0M15 19h0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' },
  wrench: { svg: '<path d="M15.2 5.2a5 5 0 0 0-6.6 6.6L4.5 15.9a1.8 1.8 0 1 0 2.6 2.6l4.1-4.1a5 5 0 0 0 6.6-6.6l-3 1-1-1 1-3Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" />' },
  plus: { svg: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />' },
  minus: { svg: '<path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />' }
};
