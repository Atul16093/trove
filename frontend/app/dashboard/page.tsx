'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, X, ExternalLink, Trash2, Send, Menu, Settings2, GripVertical,
  Check, Clock, ChevronDown, Clock3, EyeOff, Inbox, LogOut, FileText, Paperclip, Download, Copy,
} from 'lucide-react';
import { api, getToken, clearToken, Item, ItemPatch, Category } from '@/lib/api';
import { Logo } from '@/components/Logo';

/** Apple system palette — the presets offered in the color picker. */
const PRESET_COLORS = [
  '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F',
  '#FF453A', '#FF9F0A', '#FFD60A', '#30D158',
  '#40C8E0', '#64D2FF', '#A2845E', '#8E8E93',
];

/** Sidebar views that aren't category slugs. */
const RECENT = 'all';
const UNOPENED = '__unopened';

/** iOS systemGray — the accent for an item with no category yet. */
const UNSORTED_COLOR = '#8E8E93';

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const initials = (s: string) => (s || '?').replace(/[^a-zA-Z ]/g, '').trim().slice(0, 2).replace(/^\w/, (c) => c.toUpperCase()) || '?';
const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 604800) return `${Math.floor(d / 86400)}d`;
  return `${Math.floor(d / 604800)}w`;
};

/** Last-resort guard: the backend already derives a clean title, never a raw URL. */
const titleOf = (it: Item) =>
  it.kind === 'file' ? (it.fileName || it.title || 'File') : (it.title || it.displayUrl || 'Saved link');
const trunc = (s: string, max = 60) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

/**
 * A bare URL or a domain-like token with no whitespace — "example.com/x",
 * "https://…". Deliberately strict: plain search words ("ai tools", "notion")
 * and version-ish strings ("v1.2.3") must not trip the quick-save affordance.
 */
const URL_LIKE = /^(?:https?:\/\/\S+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#]\S*)?)$/i;
/** A bare "report.pdf" is someone looking for their file, not a link to save. */
const BARE_FILENAME = /^[^/]+\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|png|jpe?g|gif|md)$/i;
const asUrl = (s: string): string | null => {
  const raw = s.trim();
  if (!raw || /\s/.test(raw) || BARE_FILENAME.test(raw)) return null;
  return URL_LIKE.test(raw) ? raw : null;
};

export default function Dashboard() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [active, setActive] = useState(RECENT);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [tg, setTg] = useState<{ connected: boolean; username: string | null }>({ connected: false, username: null });
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sideOpen, setSideOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const load = useCallback(async () => {
    const [ci, cc, ct] = await Promise.all([api.items(), api.categories(), api.telegramStatus()]);
    if (ci.data) setItems(ci.data);
    if (cc.data) setCats(cc.data);
    if (ct.data) setTg(ct.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    load();
  }, [router, load]);

  const refetchItems = useCallback(async () => {
    const ci = await api.items();
    if (ci.data) setItems(ci.data);
    const cc = await api.categories();
    if (cc.data) setCats(cc.data);
  }, []);

  // Everything saved counts, including items still being sorted — otherwise the
  // header disagrees with what's actually in the trove.
  const savedCount = items.length;
  const reopened = useMemo(() => items.reduce((n, i) => n + (i.openCount || 0), 0), [items]);
  const unopenedCount = useMemo(() => items.filter((i) => !i.openCount).length, [items]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const quickAddUrl = asUrl(query);

  /**
   * One flat, newest-first list for every view — recency is the default shelf and
   * category is just a filter on top of it. Processing and uncategorized items are
   * never excluded: only an explicit category view can leave an item out.
   */
  const filtered = useMemo(() => {
    const matches = (it: Item) =>
      !searching || [it.title, it.summary, it.sourceDomain, it.fileName, it.url, ...(it.tags || [])]
        .join(' ').toLowerCase().includes(q);
    return items
      .filter((it) => {
        if (!matches(it)) return false;
        if (searching || active === RECENT) return true; // a search spans the whole trove
        if (active === UNOPENED) return !it.openCount;
        return it.category?.slug === active;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items, active, q, searching]);

  const viewTitle = searching ? `Results for "${query}"`
    : active === RECENT ? 'Recent'
    : active === UNOPENED ? 'Never opened'
    : cats.find((c) => c.slug === active)?.name || 'Recent';

  const saveUrl = async (raw: string) => {
    const res = await api.saveItem(raw);
    if (res.data) {
      setItems((prev) => [res.data as Item, ...prev.filter((i) => i.uuid !== res.data!.uuid)]);
      flash('Saved — sorting…');
      setTimeout(refetchItems, 2500);
      setTimeout(refetchItems, 6000);
    } else flash(res.message || 'Could not save');
  };

  const save = async () => {
    const raw = draftUrl.trim();
    if (!raw) { flash('Paste a link first'); return; }
    setAddOpen(false); setDraftUrl(''); setActive(RECENT); setQuery('');
    await saveUrl(raw);
  };

  /** Enter on a URL-looking search query saves it instead of searching. */
  const quickSave = async () => {
    if (!quickAddUrl) return;
    setQuery(''); setActive(RECENT);
    await saveUrl(quickAddUrl);
  };

  /** PATCH an item and swap the fresh row into both the list and the open drawer. */
  const patchItem = async (it: Item, patch: ItemPatch, note: string) => {
    const res = await api.updateItem(it.uuid, patch);
    if (!res.data) { flash(res.message || 'Could not save'); return; }
    const updated = res.data;
    setItems((prev) => prev.map((x) => (x.uuid === updated.uuid ? updated : x)));
    setSelected((cur) => (cur && cur.uuid === updated.uuid ? updated : cur));
    flash(note);
  };

  /** Recategorize in place — used by both the row chip and the drawer select. */
  const moveItem = async (it: Item, categoryUuid: string) => {
    if (!categoryUuid || categoryUuid === it.category?.uuid) return;
    await patchItem(it, { categoryUuid }, 'Moved');
    refetchItems(); // category counts in the sidebar shift with the move
  };

  /** Create a category and drop the item straight into it, from the row popover. */
  const createAndAssign = async (it: Item, name: string) => {
    const res = await api.createCategory(name.trim());
    if (!res.data) { flash(res.message || 'Could not create category'); return; }
    await patchItem(it, { categoryUuid: res.data.uuid }, `Moved to ${res.data.name}`);
    refetchItems();
  };

  const copyLink = async (it: Item) => {
    if (!it.url) return;
    try { await navigator.clipboard.writeText(it.url); flash('Link copied'); }
    catch { flash('Could not copy'); }
  };
  const remove = async (it: Item) => {
    await api.deleteItem(it.uuid); setSelected(null); refetchItems(); flash('Link removed');
  };
  const open = async (it: Item) => {
    await api.openItem(it.uuid);
    const opened = { openCount: it.openCount + 1, lastOpenedAt: new Date().toISOString() };
    setItems((prev) => prev.map((x) => (x.uuid === it.uuid ? { ...x, ...opened } : x)));
    setSelected((cur) => (cur && cur.uuid === it.uuid ? { ...cur, ...opened } : cur));
    flash('Opened · counts toward rediscovery');
    if (it.kind === 'file') {
      const url = await api.fileBlobUrl(it.uuid);
      if (url) window.open(url, '_blank'); else flash('Could not open file');
      return;
    }
    try { const u = it.url || ''; window.open(u.startsWith('http') ? u : 'https://' + u, '_blank'); } catch {}
  };

  const uploadFile = async (file: File) => {
    setActive(RECENT); setQuery('');
    flash(`Uploading ${file.name}…`);
    const res = await api.uploadFile(file);
    if (res.data) { setItems((prev) => [res.data as Item, ...prev.filter((i) => i.uuid !== res.data!.uuid)]); refetchItems(); flash('File saved'); }
    else flash(res.message || 'Upload failed');
  };
  const connectTelegram = async () => {
    const res = await api.telegramConnect();
    if (res.data) { setTgLink(res.data.deepLink); flash('Open the link in Telegram to connect'); }
  };
  const logout = () => { clearToken(); router.replace('/login'); };

  if (loading) return <div className="tv-boot"><style dangerouslySetInnerHTML={{ __html: CSS }} />Loading your Trove…</div>;

  return (
    <div className="tv-app">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {sideOpen && <div className="tv-side-scrim" onClick={() => setSideOpen(false)} />}
      <aside className={'tv-side' + (sideOpen ? ' open' : '')}>
        <div className="tv-brand">
          <Logo size={26} className="tv-logo" /><span className="tv-word">Trove</span>
          <button className="tv-side-close" onClick={() => setSideOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <button className={'tv-nav' + (active === RECENT ? ' on' : '')} onClick={() => { setActive(RECENT); setQuery(''); setSideOpen(false); }}>
          <Clock3 size={15} /><span>Recent</span><span className="tv-count">{savedCount}</span>
        </button>
        <button className={'tv-nav' + (active === UNOPENED ? ' on' : '')} onClick={() => { setActive(UNOPENED); setQuery(''); setSideOpen(false); }}>
          <EyeOff size={15} /><span>Never opened</span><span className="tv-count">{unopenedCount}</span>
        </button>

        <div className="tv-navlabel">
          <span>Categories</span>
          <button className="tv-navlabel-btn" onClick={() => setManageOpen(true)}
            title="Manage categories" aria-label="Manage categories"><Settings2 size={13} /></button>
        </div>
        {cats.map((c) => (
          <button key={c.uuid} className={'tv-nav' + (active === c.slug ? ' on' : '')} onClick={() => { setActive(c.slug); setQuery(''); setSideOpen(false); }}>
            <span className="tv-dot" style={{ background: c.color }} /><span>{c.name}</span><span className="tv-count">{c.count}</span>
          </button>
        ))}

        <div className="tv-side-foot">
          {tg.connected ? (
            <div className="tv-tg">
              <div className="tv-tg-ic"><Send size={14} /></div>
              <div><div className="tv-tg-t">Telegram connected</div><div className="tv-tg-s">Forward a link to save it</div></div>
              <Check size={14} className="tv-tg-ok" />
            </div>
          ) : (
            <button className="tv-tg tv-tg-btn" onClick={connectTelegram}>
              <div className="tv-tg-ic"><Send size={14} /></div>
              <div><div className="tv-tg-t">Connect Telegram</div><div className="tv-tg-s">Save links from your phone</div></div>
            </button>
          )}
          {tgLink && (
            <a className="tv-tglink" href={tgLink} target="_blank" rel="noreferrer">Open in Telegram →</a>
          )}
          <button className="tv-settings" onClick={logout}><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      <main className="tv-main">
        <header className="tv-top">
          <button className="tv-menu" onClick={() => setSideOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="tv-searchwrap">
            <Search size={16} className="tv-search-ic" />
            <input className="tv-search" placeholder="Search, or paste a link to save it…" value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && quickAddUrl) { e.preventDefault(); quickSave(); } }} />
            {query && <button className="tv-clear" onClick={() => setQuery('')}><X size={14} /></button>}
            {quickAddUrl && (
              <button className="tv-quickadd" onClick={quickSave}>
                <Plus size={13} /> Save this link <span className="tv-kbd">↵</span>
              </button>
            )}
          </div>
          <button className="tv-addfile" onClick={() => fileInput.current?.click()} title="Upload a PDF or document"><Paperclip size={16} /></button>
          <button className="tv-add" onClick={() => setAddOpen(true)}><Plus size={16} /> Add link</button>
          <input ref={fileInput} type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ''; }} />
        </header>

        <div className="tv-statline">
          <strong>{savedCount}</strong> saved<span className="tv-sep" />
          <strong>{reopened}</strong> reopened<span className="tv-hint">rediscovery is the whole point</span>
        </div>

        <div className="tv-scroll">
          <div className="tv-viewhead">
            {viewTitle}
            <span className="tv-viewcount">{filtered.length}</span>
          </div>

          {filtered.length === 0 && (
            <div className="tv-empty">
              <div className="tv-empty-ic">{active === UNOPENED && !searching ? <EyeOff size={22} /> : <Inbox size={22} />}</div>
              <div className="tv-empty-t">
                {searching ? 'Nothing matches that yet'
                  : active === UNOPENED ? 'Nothing forgotten'
                  : 'This shelf is empty'}
              </div>
              <div className="tv-empty-s">
                {searching ? 'Try a broader word — a tool name, a topic, or a source. A pasted link saves instead.'
                  : active === UNOPENED ? "You've opened everything you saved. Rare, and worth noticing."
                  : 'Paste a link in the search bar, or forward one to your Trove bot on Telegram and it lands here, sorted.'}
              </div>
            </div>
          )}

          {filtered.map((it) => (
            <Row key={it.uuid} it={it} cats={cats} onOpen={() => setSelected(it)}
              onMove={(uuid) => moveItem(it, uuid)} onCreateCategory={(name) => createAndAssign(it, name)} />
          ))}
        </div>
      </main>

      {selected && (
        <>
          <div className="tv-scrim" onClick={() => setSelected(null)} />
          {/* keyed by uuid so per-item draft state resets when a different item opens */}
          <DetailDrawer
            key={selected.uuid} it={selected} cats={cats}
            onClose={() => setSelected(null)}
            onOpen={() => open(selected)}
            onMove={(uuid) => moveItem(selected, uuid)}
            onCopy={() => copyLink(selected)}
            onRemove={() => remove(selected)}
            onPatch={patchItem}
          />
        </>
      )}

      {addOpen && (
        <>
          <div className="tv-scrim" onClick={() => setAddOpen(false)} />
          <div className="tv-modal">
            <div className="tv-modal-head">Add a link<button className="tv-drawer-x" onClick={() => setAddOpen(false)}><X size={16} /></button></div>
            <p className="tv-modal-sub">Paste a URL. Trove fetches the details and sorts it for you.</p>
            <input className="tv-modal-input" placeholder="https://…" value={draftUrl} autoFocus
              onChange={(e) => setDraftUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="tv-modal-file" onClick={() => { setAddOpen(false); fileInput.current?.click(); }}>
              <Paperclip size={14} /> …or upload a PDF / document instead
            </button>
            <div className="tv-modal-actions">
              <button className="tv-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="tv-add" onClick={save}><Plus size={16} /> Save link</button>
            </div>
          </div>
        </>
      )}

      {manageOpen && (
        <>
          <div className="tv-scrim" onClick={() => setManageOpen(false)} />
          <CategoryManager cats={cats} onClose={() => setManageOpen(false)} onChanged={refetchItems} flash={flash} />
        </>
      )}

      {toast && <div className="tv-toast">{toast}</div>}
    </div>
  );
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DetailDrawer({ it, cats, onClose, onOpen, onMove, onCopy, onRemove, onPatch }: {
  it: Item; cats: Category[];
  onClose: () => void; onOpen: () => void; onMove: (categoryUuid: string) => void;
  onCopy: () => void; onRemove: () => void;
  onPatch: (it: Item, patch: ItemPatch, note: string) => void;
}) {
  const [note, setNote] = useState(it.note || '');
  const [tagDraft, setTagDraft] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const color = it.category?.color || UNSORTED_COLOR;
  const tags = it.tags || [];

  // Only write when the text actually changed — blur fires on every drawer close.
  const saveNote = () => {
    const next = note.trim();
    if (next === (it.note || '')) return;
    onPatch(it, { note: next || null }, next ? 'Note saved' : 'Note cleared');
  };

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase().replace(/^#+/, '');
    setTagDraft('');
    if (!t || tags.includes(t) || tags.length >= 12) return;
    onPatch(it, { tags: [...tags, t] }, 'Tag added');
  };
  const dropTag = (t: string) => onPatch(it, { tags: tags.filter((x) => x !== t) }, 'Tag removed');

  return (
    <aside className="tv-drawer">
      <button className="tv-drawer-x" onClick={onClose}><X size={16} /></button>

      {it.imageUrl && !imgBroken ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnails, no loader configured
        <img className="tv-preview" src={it.imageUrl} alt="" onError={() => setImgBroken(true)} />
      ) : (
        <div className="tv-thumb tv-thumb-lg" style={{ background: hexA(color, 0.18) }}>
          {it.kind === 'file' ? <FileText size={22} /> : initials(it.sourceDomain || it.title || '?')}
        </div>
      )}

      <h2 className="tv-drawer-title">{titleOf(it)}</h2>
      <div className="tv-drawer-meta">
        {it.kind === 'file'
          ? `${(tags[0] || 'file').toUpperCase()}${it.fileSize ? ` · ${humanSize(it.fileSize)}` : ''}${it.sourceDomain ? ` · from ${it.sourceDomain}` : ''}`
          : it.sourceDomain}
        {' · '}saved {ago(it.createdAt)} ago
      </div>
      <div className="tv-drawer-stats">
        {it.openCount === 0 ? 'Never opened' : `Opened ${it.openCount} time${it.openCount === 1 ? '' : 's'}`}
        {it.lastOpenedAt && ` · last opened ${ago(it.lastOpenedAt)} ago`}
      </div>

      {it.displayUrl && (
        <div className="tv-urlline">
          <span className="tv-urltext" title={it.url || undefined}>{trunc(it.displayUrl)}</span>
          {it.url && <button className="tv-copy" onClick={onCopy} title="Copy link"><Copy size={12} /> Copy link</button>}
        </div>
      )}

      <button className="tv-openbtn" onClick={onOpen}>
        {it.kind === 'file' ? <><Download size={15} /> Open file</> : <><ExternalLink size={15} /> Open link</>}
      </button>

      <div className="tv-field">
        <label>Category</label>
        <div className="tv-select">
          <span className="tv-dot" style={{ background: color }} />
          <select value={it.category?.uuid || ''} onChange={(e) => onMove(e.target.value)}>
            {!it.category && <option value="">Unsorted</option>}
            {cats.map((c) => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
          </select>
          <ChevronDown size={14} className="tv-select-ic" />
        </div>
      </div>

      <div className="tv-field">
        <label>Notes — why did you save this?</label>
        <textarea className="tv-note" value={note} rows={4} onBlur={saveNote}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A line to your future self — what you wanted this for." />
      </div>

      <div className="tv-field">
        <label>Tags</label>
        <div className="tv-tags">
          {tags.map((t) => (
            <span key={t} className="tv-tag tv-tag-edit">
              #{t}
              <button className="tv-tag-x" onClick={() => dropTag(t)} aria-label={`Remove tag ${t}`}><X size={10} /></button>
            </span>
          ))}
          {tags.length === 0 && <span className="tv-tags-none">No tags yet</span>}
        </div>
        {tags.length < 12 && (
          <input className="tv-tagadd" value={tagDraft} placeholder="Add a tag…" maxLength={40}
            onChange={(e) => setTagDraft(e.target.value)} onBlur={addTag}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
        )}
      </div>

      {it.summary && <div className="tv-field"><label>Summary</label><p className="tv-summary">{it.summary}</p></div>}

      <button className="tv-delete" onClick={onRemove}><Trash2 size={14} /> Remove from Trove</button>
    </aside>
  );
}

/** A colour chip that opens a preset palette plus a custom hex field. */
function ColorSwatch({ color, onPick }: { color: string; onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(color);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(color); }, [color]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const commit = () => {
    const v = '#' + hex.trim().replace(/^#/, '');
    if (/^#[0-9a-f]{6}$/i.test(v)) { onPick(v.toUpperCase()); setOpen(false); }
  };

  return (
    <div className="tv-swatchwrap" ref={wrap}>
      <button className="tv-swatch" style={{ background: color }} onClick={() => setOpen((v) => !v)}
        aria-label="Change color" title="Change color" />
      {open && (
        <div className="tv-palette">
          <div className="tv-palette-grid">
            {PRESET_COLORS.map((c) => (
              <button key={c} className={'tv-palette-dot' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')}
                style={{ background: c }} onClick={() => { onPick(c); setOpen(false); }} aria-label={c} title={c} />
            ))}
          </div>
          <div className="tv-palette-hex">
            <input value={hex} maxLength={7} spellCheck={false} placeholder="#0A84FF"
              onChange={(e) => setHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
            <button onClick={commit}>Set</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagerRow({ cat, dragging, onRename, onRecolor, onAskDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  cat: Category; dragging: boolean;
  onRename: (name: string) => Promise<boolean>; onRecolor: (hex: string) => void; onAskDelete: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; onDragEnd: () => void;
}) {
  const [name, setName] = useState(cat.name);

  const commit = async () => {
    const next = name.trim();
    if (!next || next === cat.name) { setName(cat.name); return; }
    const ok = await onRename(next);
    if (!ok) setName(cat.name);
  };

  return (
    <div className={'tv-cm-row' + (dragging ? ' dragging' : '')} draggable
      onDragStart={onDragStart} onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop(); }} onDragEnd={onDragEnd}>
      <span className="tv-cm-grip" title="Drag to reorder"><GripVertical size={15} /></span>
      <ColorSwatch color={cat.color} onPick={onRecolor} />
      <input className="tv-cm-name" value={name} maxLength={120}
        onChange={(e) => setName(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="tv-cm-count">{cat.count}</span>
      {cat.isSystem
        ? <span className="tv-cm-default" title="Provisioned on every account — rename and recolor freely">Default</span>
        : <button className="tv-cm-del" onClick={onAskDelete} aria-label={`Delete ${cat.name}`}><Trash2 size={14} /></button>}
    </div>
  );
}

function CategoryManager({ cats, onClose, onChanged, flash }: {
  cats: Category[]; onClose: () => void; onChanged: () => void; flash: (m: string) => void;
}) {
  const [order, setOrder] = useState<Category[]>(cats);
  const [dragUuid, setDragUuid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);

  // follow the server once a change lands (counts, order, new rows)
  useEffect(() => { setOrder(cats); }, [cats]);

  const rename = async (c: Category, name: string): Promise<boolean> => {
    const res = await api.updateCategory(c.uuid, { name });
    if (!res.data) { flash(res.message || 'Could not rename'); return false; }
    flash('Renamed'); onChanged(); return true;
  };

  const recolor = async (c: Category, color: string) => {
    setOrder((prev) => prev.map((x) => (x.uuid === c.uuid ? { ...x, color } : x))); // optimistic
    const res = await api.updateCategory(c.uuid, { color });
    if (!res.data) flash(res.message || 'Could not update color');
    onChanged();
  };

  const del = async (c: Category) => {
    setBusy(true);
    const res = await api.deleteCategory(c.uuid);
    setBusy(false); setConfirming(null);
    if (!res.success) { flash(res.message || 'Could not delete'); return; }
    const n = res.data?.moved ?? 0;
    flash(n ? `Deleted — ${n} item${n === 1 ? '' : 's'} moved to Other` : 'Category deleted');
    onChanged();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const res = await api.createCategory(name, newColor);
    setBusy(false);
    if (!res.data) { flash(res.message || 'Could not create'); return; }
    setNewName(''); flash('Category created'); onChanged();
  };

  const drop = (targetUuid: string) => {
    if (!dragUuid || dragUuid === targetUuid) { setDragUuid(null); return; }
    const from = order.findIndex((c) => c.uuid === dragUuid);
    const to = order.findIndex((c) => c.uuid === targetUuid);
    setDragUuid(null);
    if (from < 0 || to < 0) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next); // show the new order immediately, then persist
    api.reorderCategories(next.map((c) => c.uuid)).then((res) => {
      if (!res.success) flash(res.message || 'Could not save order');
      onChanged();
    });
  };

  return (
    <div className="tv-modal tv-modal-wide">
      <div className="tv-modal-head">Categories
        <button className="tv-drawer-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <p className="tv-modal-sub">
        Drag to reorder, click a swatch to recolor, click a name to rename. Defaults can&rsquo;t be deleted;
        deleting one of your own moves its items to Other.
      </p>

      <div className="tv-cm-list">
        {order.map((c) => (
          <div key={c.uuid}>
            <ManagerRow
              cat={c} dragging={dragUuid === c.uuid}
              onRename={(name) => rename(c, name)}
              onRecolor={(hex) => recolor(c, hex)}
              onAskDelete={() => setConfirming(c.uuid)}
              onDragStart={() => setDragUuid(c.uuid)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(c.uuid)}
              onDragEnd={() => setDragUuid(null)}
            />
            {confirming === c.uuid && (
              <div className="tv-cm-confirm">
                <span>Delete &ldquo;{c.name}&rdquo;? {c.count === 0 ? 'It has no items.' : `Its ${c.count} item${c.count === 1 ? '' : 's'} will move to Other.`}</span>
                <div className="tv-cm-confirm-act">
                  <button className="tv-cm-cancel" onClick={() => setConfirming(null)}>Cancel</button>
                  <button className="tv-cm-confirmdel" disabled={busy} onClick={() => del(c)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="tv-cm-add">
        <ColorSwatch color={newColor} onPick={setNewColor} />
        <input className="tv-cm-newname" placeholder="New category name" value={newName} maxLength={120}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="tv-add" onClick={add} disabled={busy || !newName.trim()}><Plus size={15} /> Add</button>
      </div>
    </div>
  );
}

/**
 * The category pill on a row, with a lightweight popover for moving the item.
 * Every click inside is stopped so it never also fires the row's open handler.
 */
function CategoryChip({ it, cats, onMove, onCreateCategory }: {
  it: Item; cats: Category[]; onMove: (categoryUuid: string) => void; onCreateCategory: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const color = it.category?.color || UNSORTED_COLOR;

  useEffect(() => {
    if (!open) { setCreating(false); setDraft(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };

  return (
    <div className="tv-chipwrap" ref={wrap} onClick={stop} onKeyDown={(e) => e.stopPropagation()}>
      <button className="tv-chip"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        aria-haspopup="menu" aria-expanded={open} title="Change category">
        <span className="tv-dot" style={{ background: color }} />
        <span className="tv-chip-name">{it.category?.name || 'Unsorted'}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="tv-chipmenu" role="menu">
          {cats.map((c) => (
            <button key={c.uuid} role="menuitem"
              className={'tv-chipopt' + (c.uuid === it.category?.uuid ? ' on' : '')}
              onClick={(e) => { stop(e); setOpen(false); onMove(c.uuid); }}>
              <span className="tv-dot" style={{ background: c.color }} />
              <span className="tv-chipopt-name">{c.name}</span>
              {c.uuid === it.category?.uuid && <Check size={12} />}
            </button>
          ))}

          {/* create-and-assign in one step, for triaging without leaving the row */}
          <div className="tv-chipmenu-sep" />
          {creating ? (
            <input className="tv-chipnew-input" autoFocus placeholder="Category name…" value={draft} maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && draft.trim()) { setOpen(false); onCreateCategory(draft); }
                if (e.key === 'Escape') setCreating(false);
              }} />
          ) : (
            <button className="tv-chipopt tv-chipnew" role="menuitem"
              onClick={(e) => { stop(e); setCreating(true); }}>
              <Plus size={13} /><span className="tv-chipopt-name">New category</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ it, cats, onOpen, onMove, onCreateCategory }: {
  it: Item; cats: Category[]; onOpen: () => void;
  onMove: (categoryUuid: string) => void; onCreateCategory: (name: string) => void;
}) {
  const color = it.category?.color || UNSORTED_COLOR;
  const processing = it.kind !== 'file' && it.status === 'processing';
  const type = (it.tags?.[0] || 'file').toUpperCase();

  // A div rather than a button: the row holds an interactive category chip, and
  // a button can't legally nest one. Keyboard behaviour is kept by hand.
  return (
    <div
      className={'tv-row' + (processing ? ' tv-row-proc' : '')}
      role={processing ? undefined : 'button'}
      tabIndex={processing ? undefined : 0}
      onClick={processing ? undefined : onOpen}
      onKeyDown={processing ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
    >
      {processing ? (
        <div className="tv-thumb tv-thumb-proc"><Clock size={16} /></div>
      ) : it.kind === 'file' ? (
        <div className="tv-thumb tv-thumb-file" style={{ background: hexA(color, 0.18) }}><FileText size={18} /></div>
      ) : (
        <div className="tv-thumb" style={{ background: hexA(color, 0.18) }}>{initials(it.sourceDomain || it.title || '?')}</div>
      )}

      <div className="tv-row-body">
        {processing ? (
          <>
            <div className="tv-row-title">Fetching details…</div>
            <div className="tv-row-meta">{it.sourceDomain} · sorting into a category</div>
          </>
        ) : it.kind === 'file' ? (
          <>
            <div className="tv-row-title">{titleOf(it)}</div>
            <div className="tv-row-meta">
              {type}{it.fileSize ? ` · ${humanSize(it.fileSize)}` : ''}
              {it.sourceDomain ? ` · from ${it.sourceDomain}` : ''} · {ago(it.createdAt)} ago
            </div>
            {it.caption && <div className="tv-row-summary">{it.caption}</div>}
          </>
        ) : (
          <>
            <div className="tv-row-title">{titleOf(it)}</div>
            <div className="tv-row-meta">{it.displayUrl ? trunc(it.displayUrl, 52) : it.sourceDomain} · {ago(it.createdAt)} ago</div>
            {it.summary && <div className="tv-row-summary">{it.summary}</div>}
          </>
        )}
      </div>

      <div className="tv-row-side">
        {processing
          ? <span className="tv-proc-pill">Processing</span>
          : <CategoryChip it={it} cats={cats} onMove={onMove} onCreateCategory={onCreateCategory} />}
        {!processing && it.kind === 'file' && <span className="tv-filetag">{type}</span>}
        {!processing && it.kind !== 'file' && (it.tags || []).length > 0 && (
          <div className="tv-row-tags">{(it.tags || []).slice(0, 2).map((t) => <span key={t} className="tv-tag">#{t}</span>)}</div>
        )}
      </div>
    </div>
  );
}

const CSS = `
/* ===========================================================================
   Dashboard — Apple design language. Every value comes from a token in
   globals.css. Chrome (sidebar, bars, drawer, modals, menus, toast) is
   translucent material; content rows are solid and opaque.
   ========================================================================= */

.tv-boot{display:flex;align-items:center;justify-content:center;height:100vh;
  background:var(--base);color:var(--label-3);font-family:var(--font-sans);font-size:15px;}

.tv-app{
  --top-h:66px; --stat-h:44px; --side-w:264px;
  position:relative;display:flex;height:100vh;overflow:hidden;
  font-family:var(--font-sans);font-size:14px;color:var(--label);letter-spacing:-0.01em;
  /* the ambient wash is what the frosted chrome actually blurs */
  background:
    radial-gradient(1100px 620px at 0% -8%, var(--wash-1), transparent 62%),
    radial-gradient(900px 520px at 105% 108%, var(--wash-2), transparent 58%),
    var(--base);
}
:where(.tv-app button){font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;
  transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease),filter var(--dur-fast) var(--ease);}
:where(.tv-app button):active{transform:scale(.97);}
/* list-style rows highlight on press instead of scaling, the way Apple lists do */
.tv-nav:active,.tv-settings:active,.tv-chipopt:active,.tv-modal-file:active,.tv-tglink:active{transform:none;}

/* ---------- sidebar (material) ---------- */
/* overflow-y:auto so a long category list can never clip the Telegram card
   or Sign out off the bottom edge */
.tv-side{position:relative;z-index:3;width:var(--side-w);flex-shrink:0;display:flex;flex-direction:column;
  padding:16px 12px 14px;overflow-y:auto;overscroll-behavior:contain;
  background:var(--material);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:inset -1px 0 0 var(--separator);}
.tv-brand{display:flex;align-items:center;gap:10px;padding:6px 10px 20px;}
.tv-logo{color:var(--accent);flex-shrink:0;}
.tv-word{font-size:21px;font-weight:600;letter-spacing:-0.035em;}
.tv-navlabel{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;color:var(--label-3);padding:20px 12px 7px;}
.tv-navlabel span{flex:1;}
.tv-navlabel-btn{display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;
  border-radius:6px;color:var(--label-3);}
.tv-navlabel-btn:hover{background:var(--fill);color:var(--accent-text);}
.tv-nav{width:100%;min-height:40px;flex-shrink:0;display:flex;align-items:center;gap:11px;padding:0 12px;
  border-radius:var(--r-sm);color:var(--label-2);font-size:14px;text-align:left;}
.tv-nav span:nth-child(2){flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tv-nav svg{color:var(--label-3);flex-shrink:0;}
.tv-nav:hover{background:var(--fill-2);color:var(--label);}
/* iOS sidebar selection: a filled, accent-tinted pill behind the active item */
.tv-nav.on{background:var(--accent-soft);color:var(--accent-text);font-weight:600;}
.tv-nav.on svg,.tv-nav.on .tv-count{color:var(--accent-text);}
.tv-count{font-size:12.5px;color:var(--label-3);font-variant-numeric:tabular-nums;}
.tv-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}

.tv-side-foot{margin-top:auto;padding-top:18px;flex-shrink:0;}
.tv-tg{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:11px 12px;border-radius:var(--r-md);
  background:var(--surface);box-shadow:var(--shadow-1);}
.tv-tg-btn:hover{box-shadow:var(--shadow-2);transform:translateY(-1px);}
.tv-tg-ic{width:30px;height:30px;border-radius:9px;background:var(--accent);color:#fff;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.tv-tg-t{font-size:13px;font-weight:600;color:var(--label);}
.tv-tg-s{font-size:11.5px;color:var(--label-3);margin-top:1px;}
.tv-tg-ok{color:var(--success);margin-left:auto;flex-shrink:0;}
.tv-tglink{display:block;font-size:13px;font-weight:500;color:var(--accent-text);padding:11px 12px 3px;text-decoration:none;}
.tv-settings{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:0 12px;margin-top:5px;
  border-radius:var(--r-sm);color:var(--label-2);font-size:13.5px;}
.tv-settings svg{color:var(--label-3);}
.tv-settings:hover{background:var(--fill-2);color:var(--label);}

/* ---------- main + frosted bars ---------- */
/* The bars are lifted out of flow and the scroller is padded to match, so
   content genuinely passes underneath the blur instead of butting against it. */
.tv-main{position:relative;flex:1;display:flex;flex-direction:column;min-width:0;}

.tv-top{position:absolute;top:0;left:0;right:0;z-index:4;height:var(--top-h);
  display:flex;align-items:center;gap:12px;padding:0 22px;
  background:var(--material);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:0 1px 0 var(--separator);}
.tv-searchwrap{position:relative;flex:1;max-width:560px;}
.tv-search-ic{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--label-3);pointer-events:none;}
.tv-search{width:100%;height:40px;padding:0 38px;border:none;border-radius:var(--r-md);
  background:var(--fill);color:var(--label);font-size:14px;outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-search::placeholder{color:var(--label-3);}
.tv-search:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring),var(--shadow-1);}
.tv-clear{position:absolute;right:9px;top:50%;transform:translateY(-50%);
  display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;
  background:var(--fill-3);color:var(--label-2);}
.tv-clear:active{transform:translateY(-50%) scale(.9);}
.tv-quickadd{position:absolute;top:calc(100% + 9px);left:0;z-index:6;display:flex;align-items:center;gap:8px;
  height:36px;padding:0 15px;border-radius:var(--r-pill);
  background:var(--accent-fill);color:var(--on-accent);font-size:13px;font-weight:600;
  box-shadow:var(--shadow-2);animation:tv-pop var(--dur-fast) var(--ease) both;}
.tv-quickadd:hover{filter:brightness(1.07);}
.tv-kbd{font-size:11px;font-weight:600;background:rgba(255,255,255,.22);border-radius:5px;padding:2px 6px;line-height:1.4;}

.tv-addfile{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex-shrink:0;
  border-radius:var(--r-md);background:var(--fill);color:var(--label-2);}
.tv-addfile:hover{background:var(--fill-3);color:var(--label);}
.tv-add{display:flex;align-items:center;gap:7px;height:40px;padding:0 18px;flex-shrink:0;
  border-radius:var(--r-pill);background:var(--accent-fill);color:var(--on-accent);
  font-size:14px;font-weight:600;white-space:nowrap;box-shadow:var(--shadow-1);}
.tv-add:hover{filter:brightness(1.07);box-shadow:var(--shadow-2);}

.tv-statline{position:absolute;top:var(--top-h);left:0;right:0;z-index:3;height:var(--stat-h);
  display:flex;align-items:center;gap:8px;padding:0 24px;font-size:13px;color:var(--label-2);
  background:var(--material);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:0 1px 0 var(--separator);}
.tv-statline strong{color:var(--label);font-weight:600;font-variant-numeric:tabular-nums;}
.tv-sep{width:1px;height:12px;background:var(--separator);margin:0 5px;}
.tv-hint{margin-left:auto;font-size:12px;color:var(--label-3);}

/* ---------- content list (opaque cards) ---------- */
.tv-scroll{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:8px;
  padding:calc(var(--top-h) + var(--stat-h) + 12px) 24px 44px;-webkit-overflow-scrolling:touch;}
/* This sheet is injected via dangerouslySetInnerHTML: as a plain text child
   React would escape the quotes in [role="button"] and break the rule. */
.tv-viewhead,.tv-row,.tv-empty{flex-shrink:0;}
.tv-viewhead{display:flex;align-items:baseline;gap:11px;padding:10px 4px 4px;
  font-size:26px;font-weight:700;letter-spacing:-0.032em;color:var(--label);}
.tv-viewcount{font-size:15px;font-weight:500;color:var(--label-3);letter-spacing:-0.01em;}

.tv-row{width:100%;display:flex;align-items:flex-start;gap:14px;text-align:left;
  padding:15px 16px;border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--shadow-1);
  transition:box-shadow var(--dur) var(--ease),transform var(--dur) var(--ease);}
.tv-row[role="button"]{cursor:pointer;}
.tv-row[role="button"]:hover{box-shadow:var(--shadow-2);transform:translateY(-1px);}
.tv-row[role="button"]:active{transform:scale(.985);box-shadow:var(--shadow-1);}
.tv-row:focus-visible{box-shadow:0 0 0 4px var(--accent-ring),var(--shadow-2);}
.tv-row-proc{opacity:.85;}

.tv-thumb{width:44px;height:44px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  font-size:15px;font-weight:600;letter-spacing:-0.02em;color:var(--label);}
.tv-thumb-proc{background:var(--fill);color:var(--label-3);animation:tv-pulse 1.6s ease-in-out infinite;}
.tv-row-body{flex:1;min-width:0;padding-top:1px;}
.tv-row-title{font-size:15px;font-weight:600;letter-spacing:-0.015em;line-height:1.32;color:var(--label);
  overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.tv-row-meta{font-size:12.5px;color:var(--label-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tv-row-summary{font-size:13px;color:var(--label-2);margin-top:6px;line-height:1.5;
  overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.tv-row-side{display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;}
.tv-row-tags{display:flex;flex-direction:column;gap:5px;align-items:flex-end;}
.tv-tag{font-size:11.5px;font-weight:500;color:var(--label-2);background:var(--fill);
  padding:3px 9px;border-radius:var(--r-pill);white-space:nowrap;}
.tv-filetag{font-size:10.5px;font-weight:700;letter-spacing:.03em;color:var(--label-2);background:var(--fill);
  padding:4px 9px;border-radius:var(--r-pill);}
.tv-proc-pill{font-size:11.5px;font-weight:600;color:var(--label-2);background:var(--fill);
  padding:4px 11px;border-radius:var(--r-pill);white-space:nowrap;}

/* ---------- category chip + popover menu ---------- */
.tv-chipwrap{position:relative;}
.tv-chip{display:flex;align-items:center;gap:7px;max-width:164px;height:28px;padding:0 10px;
  border-radius:var(--r-pill);background:var(--fill);color:var(--label-2);
  font-size:12px;font-weight:600;letter-spacing:-0.005em;}
.tv-chip:hover{background:var(--fill-3);color:var(--label);}
.tv-chip svg{color:var(--label-3);flex-shrink:0;}
.tv-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tv-chipmenu{position:absolute;top:calc(100% + 7px);right:0;z-index:8;min-width:206px;max-height:280px;overflow-y:auto;
  padding:6px;border-radius:var(--r-md);transform-origin:top right;
  background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:var(--shadow-3);animation:tv-pop var(--dur-fast) var(--ease) both;}
.tv-chipopt{display:flex;align-items:center;gap:10px;width:100%;min-height:34px;padding:0 10px;
  border-radius:var(--r-xs);font-size:13.5px;color:var(--label);text-align:left;}
.tv-chipopt svg{color:var(--accent);flex-shrink:0;}
.tv-chipopt:hover{background:var(--accent-fill);color:var(--on-accent);}
.tv-chipopt:hover svg{color:var(--on-accent);}
.tv-chipopt.on{font-weight:600;}
.tv-chipopt-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tv-chipmenu-sep{height:1px;background:var(--separator);margin:5px 6px;}
.tv-chipnew{color:var(--accent-text);font-weight:600;}
.tv-chipnew svg{color:var(--accent);}
.tv-chipnew-input{width:100%;height:34px;padding:0 10px;border:none;border-radius:var(--r-xs);
  background:var(--fill-2);font-size:13.5px;color:var(--label);outline:none;}
.tv-chipnew-input:focus{background:var(--surface);box-shadow:0 0 0 3px var(--accent-ring);}

/* ---------- category manager ---------- */
.tv-modal-wide{width:560px;max-height:84vh;overflow-y:auto;}
.tv-cm-list{display:flex;flex-direction:column;gap:4px;margin-top:4px;}
.tv-cm-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:var(--r-md);
  transition:background var(--dur-fast) var(--ease),opacity var(--dur-fast) var(--ease);}
.tv-cm-row:hover{background:var(--fill-2);}
.tv-cm-row.dragging{opacity:.4;}
.tv-cm-grip{display:flex;align-items:center;color:var(--label-3);cursor:grab;flex-shrink:0;}
.tv-cm-grip:active{cursor:grabbing;}
.tv-cm-name{flex:1;min-width:0;height:34px;padding:0 10px;border:none;border-radius:var(--r-sm);
  background:transparent;font-size:14px;font-weight:500;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-cm-name:hover{background:var(--fill-2);}
.tv-cm-name:focus{background:var(--surface);box-shadow:0 0 0 3px var(--accent-ring);}
.tv-cm-count{font-size:12.5px;color:var(--label-3);font-variant-numeric:tabular-nums;flex-shrink:0;min-width:20px;text-align:right;}
.tv-cm-default{font-size:10.5px;font-weight:600;letter-spacing:.02em;color:var(--label-3);background:var(--fill);
  padding:3px 8px;border-radius:var(--r-pill);flex-shrink:0;}
.tv-cm-del{display:flex;align-items:center;justify-content:center;width:30px;height:30px;flex-shrink:0;
  border-radius:50%;color:var(--label-3);}
.tv-cm-del:hover{background:var(--danger-soft);color:var(--danger);}
.tv-cm-confirm{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 0 6px;padding:11px 13px;
  border-radius:var(--r-md);background:var(--danger-soft);font-size:12.5px;color:var(--label);line-height:1.45;}
.tv-cm-confirm span{flex:1;min-width:180px;}
.tv-cm-confirm-act{display:flex;gap:8px;flex-shrink:0;}
.tv-cm-cancel{height:30px;padding:0 13px;border-radius:var(--r-pill);background:var(--fill);
  color:var(--label);font-size:12.5px;font-weight:600;}
.tv-cm-cancel:hover{background:var(--fill-3);}
.tv-cm-confirmdel{height:30px;padding:0 13px;border-radius:var(--r-pill);background:var(--danger);
  color:#fff;font-size:12.5px;font-weight:600;}
.tv-cm-confirmdel:hover{filter:brightness(1.08);}
.tv-cm-confirmdel:disabled{opacity:.55;cursor:default;}
.tv-cm-add{display:flex;align-items:center;gap:10px;margin-top:18px;padding-top:16px;
  border-top:1px solid var(--separator);}
.tv-cm-newname{flex:1;min-width:0;height:40px;padding:0 14px;border:none;border-radius:var(--r-md);
  background:var(--fill-2);font-size:14px;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-cm-newname::placeholder{color:var(--label-3);}
.tv-cm-newname:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}
.tv-cm-add .tv-add:disabled{opacity:.45;cursor:default;filter:none;}

/* ---------- color picker ---------- */
.tv-swatchwrap{position:relative;flex-shrink:0;}
.tv-swatch{display:block;width:24px;height:24px;border-radius:8px;box-shadow:var(--shadow-1),inset 0 0 0 1px rgba(0,0,0,.06);}
.tv-swatch:hover{box-shadow:var(--shadow-2),inset 0 0 0 1px rgba(0,0,0,.06);}
.tv-palette{position:absolute;top:calc(100% + 7px);left:0;z-index:9;width:192px;padding:9px;
  border-radius:var(--r-md);background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:var(--shadow-3);transform-origin:top left;animation:tv-pop var(--dur-fast) var(--ease) both;}
.tv-palette-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;}
.tv-palette-dot{width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
.tv-palette-dot:hover{transform:scale(1.14);}
.tv-palette-dot.on{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--accent);}
.tv-palette-hex{display:flex;gap:6px;margin-top:9px;}
.tv-palette-hex input{flex:1;min-width:0;height:30px;padding:0 9px;border:none;border-radius:var(--r-xs);
  background:var(--fill-2);font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--label);outline:none;text-transform:uppercase;}
.tv-palette-hex input:focus{background:var(--surface);box-shadow:0 0 0 3px var(--accent-ring);}
.tv-palette-hex button{height:30px;padding:0 11px;border-radius:var(--r-xs);background:var(--fill);
  color:var(--label);font-size:12px;font-weight:600;}
.tv-palette-hex button:hover{background:var(--accent-fill);color:var(--on-accent);}

/* ---------- empty state ---------- */
.tv-empty{text-align:center;padding:72px 24px;}
.tv-empty-ic{width:60px;height:60px;border-radius:18px;background:var(--fill);color:var(--label-3);
  display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
.tv-empty-t{font-size:18px;font-weight:600;letter-spacing:-0.022em;}
.tv-empty-s{font-size:14px;color:var(--label-2);margin:8px auto 0;max-width:380px;line-height:1.55;}

/* ---------- overlays: scrim, drawer, modal, toast ---------- */
.tv-scrim{position:absolute;inset:0;z-index:5;background:rgba(0,0,0,.28);
  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);
  animation:tv-fade var(--dur-fast) var(--ease) both;}

.tv-drawer{position:absolute;z-index:6;top:12px;right:12px;bottom:12px;width:420px;max-width:calc(100% - 24px);
  padding:26px;overflow-y:auto;border-radius:var(--r-xl);
  background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:var(--shadow-3);animation:tv-drawer-in var(--dur) var(--ease) both;}
/* frosted + shadowed so it stays legible when it sits over a light preview image */
.tv-drawer-x{position:absolute;top:18px;right:18px;z-index:2;display:flex;align-items:center;justify-content:center;
  width:30px;height:30px;border-radius:50%;color:var(--label);
  background:var(--material-thick);
  -webkit-backdrop-filter:blur(12px) saturate(180%);backdrop-filter:blur(12px) saturate(180%);
  box-shadow:var(--shadow-1);}
.tv-drawer-x:hover{background:var(--fill-3);color:var(--label);}
.tv-preview{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r-lg);
  margin-bottom:18px;background:var(--fill);box-shadow:var(--shadow-1);}
.tv-thumb-lg{width:58px;height:58px;border-radius:16px;font-size:19px;margin-bottom:16px;}
.tv-drawer-title{font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.24;margin:0 38px 0 0;overflow-wrap:anywhere;}
.tv-drawer-meta{font-size:13px;color:var(--label-3);margin-top:8px;}
.tv-drawer-stats{font-size:13px;color:var(--label-2);margin-top:3px;}
.tv-urlline{display:flex;align-items:center;gap:10px;margin-top:16px;padding:10px 12px;
  border-radius:var(--r-md);background:var(--fill-2);}
.tv-urltext{flex:1;min-width:0;font-size:12.5px;color:var(--label-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tv-copy{display:flex;align-items:center;gap:6px;flex-shrink:0;height:28px;padding:0 11px;border-radius:var(--r-pill);
  background:var(--surface);color:var(--label-2);font-size:12px;font-weight:600;box-shadow:var(--shadow-1);}
.tv-copy:hover{color:var(--accent-text);box-shadow:var(--shadow-2);}
.tv-openbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;margin-top:18px;
  border-radius:var(--r-pill);background:var(--accent-fill);color:var(--on-accent);
  font-size:15px;font-weight:600;box-shadow:var(--shadow-1);}
.tv-openbtn:hover{filter:brightness(1.07);box-shadow:var(--shadow-2);}

.tv-field{margin-top:24px;}
.tv-field label{display:block;font-size:12px;font-weight:600;color:var(--label-3);margin-bottom:9px;}
.tv-select{position:relative;display:flex;align-items:center;gap:9px;height:44px;padding:0 12px;
  border-radius:var(--r-md);background:var(--fill-2);
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-select:focus-within{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}
.tv-select select{flex:1;min-width:0;appearance:none;-webkit-appearance:none;background:none;border:none;padding:0;
  font-size:14px;color:var(--label);outline:none;cursor:pointer;}
.tv-select-ic{color:var(--label-3);pointer-events:none;flex-shrink:0;}
.tv-note{width:100%;min-height:104px;resize:vertical;padding:12px 14px;border:none;border-radius:var(--r-md);
  background:var(--fill-2);font-size:14px;line-height:1.55;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-note::placeholder{color:var(--label-3);}
.tv-note:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}
.tv-tags{display:flex;flex-wrap:wrap;gap:7px;align-items:center;}
.tv-tag-edit{display:inline-flex;align-items:center;gap:5px;padding:4px 5px 4px 11px;}
.tv-tag-x{display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:var(--label-3);}
.tv-tag-x:hover{background:var(--danger-soft);color:var(--danger);}
.tv-tags-none{font-size:13px;color:var(--label-3);}
.tv-tagadd{width:100%;height:40px;margin-top:10px;padding:0 14px;border:none;border-radius:var(--r-md);
  background:var(--fill-2);font-size:13.5px;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-tagadd::placeholder{color:var(--label-3);}
.tv-tagadd:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}
.tv-summary{font-size:14px;color:var(--label-2);line-height:1.6;}
.tv-delete{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:44px;margin-top:30px;
  border-radius:var(--r-pill);background:var(--danger-soft);color:var(--danger);font-size:14px;font-weight:600;}
.tv-delete:hover{background:var(--danger-soft-2);}

.tv-modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:6;
  width:480px;max-width:calc(100% - 32px);padding:26px;border-radius:var(--r-xl);
  background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:var(--shadow-3);animation:tv-modal-in var(--dur) var(--ease) both;}
.tv-modal-head{display:flex;align-items:center;justify-content:space-between;font-size:19px;font-weight:700;letter-spacing:-0.026em;}
.tv-modal-head .tv-drawer-x{position:static;}
.tv-modal-sub{font-size:13.5px;color:var(--label-2);margin:8px 0 18px;line-height:1.5;}
.tv-modal-input{width:100%;height:46px;padding:0 15px;border:none;border-radius:var(--r-md);background:var(--fill-2);
  font-size:15px;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-modal-input::placeholder{color:var(--label-3);}
.tv-modal-input:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}
.tv-modal-file{display:flex;align-items:center;gap:8px;margin-top:14px;padding:4px 0;font-size:13px;color:var(--label-2);}
.tv-modal-file:hover{color:var(--accent-text);}
.tv-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;}
.tv-ghost{height:40px;padding:0 18px;border-radius:var(--r-pill);background:var(--fill);
  color:var(--label);font-size:14px;font-weight:600;}
.tv-ghost:hover{background:var(--fill-3);}

.tv-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:9;
  padding:11px 18px;border-radius:var(--r-pill);
  background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  color:var(--label);font-size:13.5px;font-weight:500;box-shadow:var(--shadow-3);
  animation:tv-toast-in var(--dur) var(--ease) both;}

/* ---------- motion ---------- */
@keyframes tv-fade{from{opacity:0;}to{opacity:1;}}
@keyframes tv-pop{from{opacity:0;transform:scale(.94);}to{opacity:1;transform:scale(1);}}
@keyframes tv-pulse{0%,100%{opacity:1;}50%{opacity:.45;}}
@keyframes tv-drawer-in{from{transform:translateX(calc(100% + 16px));}to{transform:translateX(0);}}
@keyframes tv-modal-in{from{opacity:0;transform:translate(-50%,-50%) scale(.94);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}
@keyframes tv-toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}

/* ---------- scrollbars ---------- */
.tv-scroll::-webkit-scrollbar,.tv-drawer::-webkit-scrollbar,.tv-chipmenu::-webkit-scrollbar,.tv-side::-webkit-scrollbar{width:11px;}
.tv-scroll::-webkit-scrollbar-thumb,.tv-drawer::-webkit-scrollbar-thumb,
.tv-chipmenu::-webkit-scrollbar-thumb,.tv-side::-webkit-scrollbar-thumb{
  background:var(--fill-3);border-radius:var(--r-pill);border:3px solid transparent;background-clip:content-box;}
.tv-scroll::-webkit-scrollbar-track,.tv-drawer::-webkit-scrollbar-track{background:transparent;}

/* ---------- compact ---------- */
.tv-menu,.tv-side-close,.tv-side-scrim{display:none;}
@media (max-width:860px){
  .tv-app{--top-h:62px;}
  .tv-menu{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex-shrink:0;
    border-radius:var(--r-md);background:var(--fill);color:var(--label);}
  .tv-side-close{display:flex;align-items:center;justify-content:center;margin-left:auto;
    width:30px;height:30px;border-radius:50%;background:var(--fill);color:var(--label-2);}
  .tv-side{position:absolute;top:0;left:0;height:100%;z-index:8;transform:translateX(-100%);
    transition:transform var(--dur) var(--ease);box-shadow:none;}
  .tv-side.open{transform:translateX(0);box-shadow:var(--shadow-3);}
  .tv-side-scrim{display:block;position:absolute;inset:0;z-index:7;background:rgba(0,0,0,.28);
    -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);animation:tv-fade var(--dur-fast) var(--ease) both;}
  .tv-top{padding:0 14px;gap:9px;}
  .tv-statline{padding:0 16px;}
  .tv-scroll{padding-left:14px;padding-right:14px;}
  .tv-searchwrap{max-width:none;}
  .tv-hint{display:none;}
  .tv-add{padding:0 13px;}
  .tv-viewhead{font-size:23px;}
  .tv-drawer{top:0;right:0;bottom:0;width:100%;max-width:100%;border-radius:0;padding:22px 18px;
    animation-name:tv-drawer-in-full;}
  @keyframes tv-drawer-in-full{from{transform:translateX(100%);}to{transform:translateX(0);}}
}
`;
