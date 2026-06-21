'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Folder, Users, ArrowLeft, Settings2, Search, Loader2, GripHorizontal, X, Upload, Trash2, Tag as TagIcon, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImportModal } from '@/components/contacts/import-modal';

interface FolderItem {
  id: string;
  name: string;
  color: string;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  custom_values?: Record<string, string>;
  tags?: TagItem[];
}

interface CustomField {
  id: string;
  field_name: string;
}

type SortDirection = 'asc' | 'desc' | null;
interface SortState {
  column: string | null;
  direction: SortDirection;
}

// --- INLINE EDITING COMPONENTS ---
function EditableInput({ initialValue, onSave }: { initialValue: string, onSave: (val: string) => void }) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => setVal(initialValue), [initialValue]);

  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val !== initialValue) onSave(val); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-full bg-transparent text-sm text-slate-300 outline-none focus:ring-1 focus:ring-primary focus:bg-slate-900 rounded px-1.5 py-1 transition-all border border-transparent hover:border-slate-700/50"
    />
  );
}

function EditableTextarea({ initialValue, onSave }: { initialValue: string, onSave: (val: string) => void }) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => setVal(initialValue), [initialValue]);
  return (
    <textarea
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val !== initialValue) onSave(val); }}
      rows={1}
      // Changed "resize-y" to "resize-none" and added "overflow-hidden" to keep it perfectly clean
      className="w-full bg-transparent text-sm text-slate-300 outline-none focus:ring-1 focus:ring-primary focus:bg-slate-900 rounded px-1.5 py-1 border border-transparent hover:border-slate-700/50 resize-none min-h-[32px] overflow-hidden"
    />
  );
}

export default function ContactsDirectory() {
  const supabase = createClient();
  const { accountId } = useAuth();

  // Data State
  const [activeFolder, setActiveFolder] = useState<FolderItem | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortState>({ column: null, direction: null });

  // UI State
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTagsFor, setEditingTagsFor] = useState<Contact | null>(null);

  // Column State
  const [columnOrder, setColumnOrder] = useState<string[]>(['name', 'phone', 'tags', 'email', 'company']);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true, phone: true, tags: true, email: true, company: true,
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Menu Refs for Click-Outside
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showTagFilterMenu, setShowTagFilterMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  // 1. Click-Outside Global Listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false);
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setShowTagFilterMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 2. Load Configs
  useEffect(() => {
    const savedSort = localStorage.getItem('crm_sort_config');
    if (savedSort) setSortConfig(JSON.parse(savedSort));
  }, []);

  useEffect(() => {
    setSelectedContacts(new Set());
    setSearchQuery('');
    setTagFilter([]);
  }, [activeFolder]);

  // 3. Fetch Initial Data
  useEffect(() => {
    if (!accountId) return;
    async function loadInitialData() {
      setLoading(true);

      const { data: folderData } = await supabase.from('folders').select('*').eq('account_id', accountId).order('name');
      if (folderData) setFolders(folderData);

      const { data: tagData } = await supabase.from('tags').select('*').eq('account_id', accountId).order('name');
      if (tagData) setAllTags(tagData);

      const { data: fieldsData } = await supabase.from('custom_fields').select('id, field_name').order('field_name');

      if (fieldsData) {
        setCustomFields(fieldsData);
        let newCols = { name: true, phone: true, tags: true, email: true, company: true } as Record<string, boolean>;
        let newOrder = ['name', 'phone', 'tags', 'email', 'company'];

        fieldsData.forEach(field => {
          newCols[field.id] = true;
          newOrder.push(field.id);
        });

        const savedOrder = localStorage.getItem('crm_col_order');
        const savedVis = localStorage.getItem('crm_col_vis');
        const savedWidths = localStorage.getItem('crm_col_widths');

        if (savedOrder) {
          const parsedOrder = JSON.parse(savedOrder);
          const missingFields = newOrder.filter(col => !parsedOrder.includes(col));
          newOrder = [...parsedOrder, ...missingFields];
        }
        if (savedVis) newCols = { ...newCols, ...JSON.parse(savedVis) };
        if (savedWidths) setColumnWidths(JSON.parse(savedWidths));

        setVisibleColumns(newCols);
        setColumnOrder(newOrder);
      }
      setLoading(false);
    }
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, supabase]);

  // 4. Fetch Contacts
  useEffect(() => {
    if (!activeFolder || !accountId) return;
    async function loadFolderContacts() {
      setLoading(true);
      const { data: contactsData } = await supabase.from('contacts').select('*').eq('folder_id', activeFolder.id);

      if (!contactsData || contactsData.length === 0) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const contactIds = contactsData.map(c => c.id);
      const { data: customValuesData } = await supabase.from('contact_custom_values').select('*').in('contact_id', contactIds);
      const { data: contactTagsData } = await supabase.from('contact_tags').select('contact_id, tag_id, tags(id, name, color)').in('contact_id', contactIds);

      const formattedContacts = contactsData.map(c => {
        const cVals = customValuesData?.filter(cv => cv.contact_id === c.id) || [];
        const customMap: Record<string, string> = {};
        cVals.forEach(cv => { customMap[cv.custom_field_id] = cv.value; });

        const myTags = contactTagsData
          ?.filter(ct => ct.contact_id === c.id)
          .map(ct => Array.isArray(ct.tags) ? ct.tags[0] : ct.tags)
          .filter(Boolean) as TagItem[] || [];

        return { ...c, custom_values: customMap, tags: myTags };
      });

      setContacts(formattedContacts);
      setLoading(false);
    }
    loadFolderContacts();
  }, [activeFolder, accountId, supabase]);

  // --- FILTERING & SORTING ENGINE ---
  const handleSort = (column: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') direction = 'desc';
    if (sortConfig.column === column && sortConfig.direction === 'desc') direction = null;

    const newSort = { column: direction ? column : null, direction };
    setSortConfig(newSort);
    localStorage.setItem('crm_sort_config', JSON.stringify(newSort));
  };

  const processedContacts = contacts
    .filter(contact => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        let matchesSearch = contact.name?.toLowerCase().includes(q) || contact.phone.includes(q) || contact.email?.toLowerCase().includes(q) || contact.company?.toLowerCase().includes(q);
        if (!matchesSearch && contact.custom_values) {
          matchesSearch = Object.values(contact.custom_values).some(val => String(val).toLowerCase().includes(q));
        }
        if (!matchesSearch) return false;
      }

      // Tag Filter (Fixed robust matching)
      if (tagFilter.length > 0) {
        const contactTagIds = contact.tags?.map(t => t.id) || [];
        const hasMatchingTag = tagFilter.some(id => contactTagIds.includes(id));
        if (!hasMatchingTag) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortConfig.column || !sortConfig.direction) return 0;
      let valA: string = ''; let valB: string = '';

      if (['name', 'phone', 'email', 'company'].includes(sortConfig.column)) {
        valA = String((a as any)[sortConfig.column] || '').toLowerCase();
        valB = String((b as any)[sortConfig.column] || '').toLowerCase();
      } else if (sortConfig.column === 'tags') {
        valA = a.tags?.map(t => t.name).join(',').toLowerCase() || '';
        valB = b.tags?.map(t => t.name).join(',').toLowerCase() || '';
      } else {
        valA = String(a.custom_values?.[sortConfig.column] || '').toLowerCase();
        valB = String(b.custom_values?.[sortConfig.column] || '').toLowerCase();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const toggleFilterTag = (tagId: string) => {
    setTagFilter(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  // --- ACTIONS & AUTO-SAVES ---
  async function handleInlineSave(contactId: string, colId: string, newValue: string, isDefault: boolean) {
    // Optimistic UI Update
    setContacts(prev => prev.map(c => {
      if (c.id !== contactId) return c;
      if (isDefault) return { ...c, [colId]: newValue };
      return { ...c, custom_values: { ...c.custom_values, [colId]: newValue } };
    }));

    // Database Update
    if (isDefault) {
      const { error } = await supabase.from('contacts').update({ [colId]: newValue }).eq('id', contactId);
      if (error) toast.error(`Failed to save ${colId}`);
    } else {
      const { error } = await supabase.from('contact_custom_values').upsert({
        contact_id: contactId, custom_field_id: colId, value: newValue
      }, { onConflict: 'contact_id, custom_field_id' });
      if (error) toast.error("Failed to save custom field");
    }
  }

  async function toggleInlineTag(contactId: string, tag: TagItem) {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    const hasTag = contact.tags?.some(t => t.id === tag.id);
    let newTags = contact.tags || [];

    if (hasTag) {
      newTags = newTags.filter(t => t.id !== tag.id);
      await supabase.from('contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tag.id);
    } else {
      newTags = [...newTags, tag];
      await supabase.from('contact_tags').insert({ contact_id: contactId, tag_id: tag.id });
    }

    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags: newTags } : c));
    setEditingTagsFor(prev => prev ? { ...prev, tags: newTags } : null);
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("⚠️ WARNING: This will delete this folder AND completely erase all contacts inside it. Proceed?")) return;
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) return toast.error("Failed to delete folder");
    toast.success("Folder and contacts permanently deleted.");
    setFolders(prev => prev.filter(f => f.id !== folderId));
  }

  const toggleSelectAll = () => {
    if (selectedContacts.size === processedContacts.length && processedContacts.length > 0) setSelectedContacts(new Set());
    else setSelectedContacts(new Set(processedContacts.map(c => c.id)));
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedContacts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContacts(next);
  };

  async function handleBulkDelete() {
    if (!confirm(`Are you sure you want to delete ${selectedContacts.size} contacts? This cannot be undone.`)) return;
    const idsToDelete = Array.from(selectedContacts);
    const { error } = await supabase.from('contacts').delete().in('id', idsToDelete);
    if (error) toast.error("Failed to delete contacts.");
    else {
      toast.success(`${idsToDelete.length} contacts deleted.`);
      setContacts(prev => prev.filter(c => !selectedContacts.has(c.id)));
      setSelectedContacts(new Set());
    }
  }

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [colId]: !prev[colId] };
      localStorage.setItem('crm_col_vis', JSON.stringify(next));
      return next;
    });
  };

  // --- DRAG AND RESIZE ---
  const handleDragStart = (e: React.DragEvent, colId: string) => e.dataTransfer.setData('text/plain', colId);

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const sourceColId = e.dataTransfer.getData('text/plain');
    if (sourceColId === targetColId) return;

    const newOrder = [...columnOrder];
    const srcIdx = newOrder.indexOf(sourceColId);
    const tgtIdx = newOrder.indexOf(targetColId);
    newOrder.splice(srcIdx, 1);
    newOrder.splice(tgtIdx, 0, sourceColId);

    setColumnOrder(newOrder);
    localStorage.setItem('crm_col_order', JSON.stringify(newOrder));
  };

  const handleMouseUpResize = (colId: string, e: React.MouseEvent<HTMLTableCellElement>) => {
    const newWidth = Math.round(e.currentTarget.getBoundingClientRect().width);
    if (columnWidths[colId] !== newWidth) {
      setColumnWidths(prev => {
        const next = { ...prev, [colId]: newWidth };
        localStorage.setItem('crm_col_widths', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleDoubleClickResize = (colId: string) => {
    setColumnWidths(prev => {
      const next = { ...prev, [colId]: -1 };
      localStorage.setItem('crm_col_widths', JSON.stringify(next));
      return next;
    });
  };

  function getColumnLabel(colId: string) {
    if (['name', 'phone', 'email', 'company', 'tags'].includes(colId)) return colId.charAt(0).toUpperCase() + colId.slice(1);
    return customFields.find(cf => cf.id === colId)?.field_name || colId;
  }

  function renderInlineCell(contact: Contact, col: string) {
    if (col === 'tags') {
      return (
        <div
          onClick={() => setEditingTagsFor(contact)}
          className="flex flex-wrap gap-1 py-1 cursor-pointer hover:bg-slate-800/50 rounded px-1.5 min-h-[32px] items-center border border-transparent hover:border-slate-700/50 transition-all"
        >
          {(!contact.tags || contact.tags.length === 0) ? <span className="text-slate-600 italic text-xs px-1">+ Add tags</span> :
            contact.tags.map(t => (
              <span key={t.id} className="px-1.5 py-0.5 rounded text-[11px] font-medium border border-transparent whitespace-nowrap" style={{ backgroundColor: `${t.color}20`, color: t.color, borderColor: `${t.color}40` }}>
                {t.name}
              </span>
            ))
          }
        </div>
      );
    }

    const isDefault = ['name', 'phone', 'email', 'company'].includes(col);
    const initialValue = isDefault ? (contact[col as keyof Contact] as string || '') : (contact.custom_values?.[col] || '');

    if (isDefault) {
      return <EditableInput initialValue={initialValue} onSave={(val) => handleInlineSave(contact.id, col, val, true)} />;
    } else {
      return <EditableTextarea initialValue={initialValue} onSave={(val) => handleInlineSave(contact.id, col, val, false)} />;
    }
  }


  // --- RENDERS ---

  if (!activeFolder) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Contact Folders</h1>
            <p className="text-slate-400 text-sm">Select a directory to view your imported groups.</p>
          </div>
          <Button onClick={() => setIsImportOpen(true)} className="bg-primary hover:bg-primary/90 text-white">
            <Upload className="size-4 mr-2" /> Import CSV
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : folders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-700 rounded-xl bg-slate-900/50 flex flex-col items-center">
            <Folder className="size-12 text-slate-600 mb-3" />
            <h3 className="text-white font-medium">No Folders Found</h3>
            <p className="text-slate-400 text-sm mt-1 mb-4">Upload a CSV file to automatically generate your first folder.</p>
            <Button onClick={() => setIsImportOpen(true)} className="bg-primary hover:bg-primary/90 text-white">
              <Upload className="size-4 mr-2" /> Upload CSV
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => setActiveFolder(folder)}
                className="relative group cursor-pointer bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary/50 hover:bg-slate-800/80 transition-all shadow-sm flex flex-col items-center text-center space-y-3"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all"
                  title="Delete Folder & All Contacts"
                >
                  <X className="size-4" />
                </button>
                <div className="size-12 rounded-full flex items-center justify-center bg-opacity-20" style={{ backgroundColor: `${folder.color}20`, color: folder.color || '#3b82f6' }}>
                  <Folder className="size-6" />
                </div>
                <h3 className="text-slate-200 font-semibold truncate px-2 w-full">{folder.name}</h3>
              </div>
            ))}
          </div>
        )}

        <ImportModal open={isImportOpen} onOpenChange={setIsImportOpen} onImported={() => window.location.reload()} />
      </div>
    );
  }

  const visibleOrderedCols = columnOrder.filter(col => visibleColumns[col]);
  const defaultCols = ['name', 'phone', 'tags', 'email', 'company'];
  const customCols = columnOrder.filter(col => !defaultCols.includes(col));

  return (
    <div className="p-6 max-w-[100vw] mx-auto space-y-4 flex flex-col h-screen">
      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveFolder(null)} className="text-slate-400 hover:text-white">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Folder className="size-6" style={{ color: activeFolder.color || '#3b82f6' }} />
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{activeFolder.name}</h1>
              <p className="text-slate-400 text-xs">{contacts.length} records inside</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          {selectedContacts.size > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30">
              <Trash2 className="size-4 mr-2" /> Delete ({selectedContacts.size})
            </Button>
          )}

          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Deep Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-64 pl-9 bg-slate-950 border-slate-700 text-sm text-white focus:border-primary"
            />
            {searchQuery && (
              <X className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer hover:text-white" onClick={() => setSearchQuery('')} />
            )}
          </div>

          <div className="relative" ref={tagMenuRef}>
            <Button variant="outline" className={`border-slate-700 bg-slate-950 text-slate-300 ${tagFilter.length > 0 ? 'border-primary/50 text-primary' : ''}`} onClick={() => setShowTagFilterMenu(!showTagFilterMenu)}>
              <TagIcon className="size-4 mr-2" /> Filter Tags
              {tagFilter.length > 0 && <span className="ml-2 bg-primary text-white text-xs rounded-full px-1.5 py-0.5">{tagFilter.length}</span>}
            </Button>
            {showTagFilterMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2 flex flex-col">
                <div className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2 pt-2">Filter by Automations</div>
                {allTags.length === 0 ? (
                  <div className="text-xs text-slate-500 p-2 italic">No tags exist yet.</div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin pb-2">
                    {allTags.map(tag => (
                      <label key={tag.id} className="flex items-center gap-2 p-2 mx-1 hover:bg-slate-800 rounded cursor-pointer">
                        <input type="checkbox" checked={tagFilter.includes(tag.id)} onChange={() => toggleFilterTag(tag.id)} className="rounded border-slate-600 text-primary focus:ring-primary bg-slate-900" />
                        <span className="text-sm truncate" style={{ color: tag.color }}>{tag.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {tagFilter.length > 0 && (
                  <div className="border-t border-slate-800 pt-2 mt-1">
                    <Button variant="ghost" size="sm" onClick={() => setTagFilter([])} className="w-full text-xs text-slate-400 hover:text-white">Clear Filters</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={colMenuRef}>
            <Button variant="outline" className="border-slate-700 bg-slate-950 text-slate-300" onClick={() => setShowColumnMenu(!showColumnMenu)}>
              <Settings2 className="size-4 mr-2" /> Columns
            </Button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2 flex flex-col">
                <div className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2 pt-2">Default Fields</div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin pb-2">
                  {defaultCols.map(col => (
                    <label key={col} className="flex items-center gap-2 p-2 mx-1 hover:bg-slate-800 rounded cursor-pointer">
                      <input type="checkbox" checked={visibleColumns[col] || false} onChange={() => handleToggleColumn(col)} className="rounded border-slate-600 text-primary focus:ring-primary bg-slate-900" />
                      <span className="text-sm text-slate-300 truncate">{getColumnLabel(col)}</span>
                    </label>
                  ))}

                  {customCols.length > 0 && <div className="text-xs font-semibold text-slate-400 uppercase px-2 pt-2 pb-1 border-t border-slate-800 mt-1">Custom Fields</div>}
                  {customCols.map(col => (
                    <label key={col} className="flex items-center gap-2 p-2 mx-1 hover:bg-slate-800 rounded cursor-pointer">
                      <input type="checkbox" checked={visibleColumns[col] || false} onChange={() => handleToggleColumn(col)} className="rounded border-slate-600 text-primary focus:ring-primary bg-slate-900" />
                      <span className="text-sm text-slate-300 truncate">{getColumnLabel(col)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col relative max-w-full">
        {loading ? (
          <div className="flex-1 flex justify-center items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : processedContacts.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-slate-500">
            <Users className="size-10 mb-2 opacity-50" />
            <p>{contacts.length > 0 ? "No contacts match your current filters." : "This folder is currently empty."}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-thin w-full max-w-full">
            <table className="text-left table-fixed border-collapse w-max min-w-full">
              <thead className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 text-slate-400 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 border-r border-slate-800/50 w-[50px] shrink-0 align-top">
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={selectedContacts.size === processedContacts.length && processedContacts.length > 0}
                      className="rounded border-slate-600 bg-slate-900 text-primary cursor-pointer mt-1"
                    />
                  </th>

                  {visibleOrderedCols.map(col => {
                    const colWidth = columnWidths[col] === -1 ? 'max-content' : (columnWidths[col] ? `${columnWidths[col]}px` : '200px');

                    return (
                      <th
                        key={col}
                        data-colid={col}
                        onMouseUp={(e) => handleMouseUpResize(col, e)}
                        className="px-2 py-3 border-r border-slate-800/50 hover:bg-slate-800 transition-colors align-top group relative"
                        style={{
                          resize: 'horizontal',
                          overflow: 'hidden',
                          width: colWidth,
                          minWidth: 150,
                          maxWidth: 800
                        }}
                      >
                        <div className="flex items-center justify-between w-full h-full px-2">
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, col)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, col)}
                            onDoubleClick={() => handleDoubleClickResize(col)}
                            className="flex items-center gap-2 cursor-grab active:cursor-grabbing hover:text-white flex-1 overflow-hidden"
                            title="Double-click to snap to text width"
                          >
                            <GripHorizontal className="size-3 text-slate-600 shrink-0" />
                            <span className="truncate font-medium">{getColumnLabel(col)}</span>
                          </div>

                          <button
                            onClick={() => handleSort(col)}
                            className={`p-1 rounded transition-colors shrink-0 ${sortConfig.column === col ? 'text-primary bg-primary/10' : 'text-slate-600 hover:text-white hover:bg-slate-700'}`}
                            title={`Sort by ${getColumnLabel(col)}`}
                          >
                            <ArrowUpDown className="size-3.5" />
                          </button>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/50">
                {processedContacts.map((contact) => (
                  <tr key={contact.id} className={`transition-colors group ${selectedContacts.has(contact.id) ? 'bg-primary/10' : 'hover:bg-slate-800/40'}`}>
                    <td className="px-4 py-3 border-r border-slate-800/50 align-top">
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(contact.id)}
                        onChange={() => toggleSelectRow(contact.id)}
                        className="rounded border-slate-600 bg-slate-900 text-primary cursor-pointer mt-1.5"
                      />
                    </td>

                    {/* Inline Editable Cells Render Engine */}
                    {visibleOrderedCols.map(col => (
                      <td key={col} className="px-2 py-2 border-r border-slate-800/50 align-top overflow-hidden max-w-0">
                        {renderInlineCell(contact, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline Tag Assignment Modal Popup */}
      <Dialog open={!!editingTagsFor} onOpenChange={(open) => !open && setEditingTagsFor(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle>Assign Tags to {editingTagsFor?.name || 'Contact'}</DialogTitle></DialogHeader>

          <div className="py-4">
            {allTags.length === 0 ? (
              <p className="text-slate-500 text-sm italic">No tags exist in your account. Create some first!</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => {
                  const isSelected = editingTagsFor?.tags?.some(t => t.id === tag.id);
                  return (
                    <div
                      key={tag.id}
                      onClick={() => toggleInlineTag(editingTagsFor!.id, tag)}
                      className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border select-none hover:opacity-80"
                      style={{
                        backgroundColor: isSelected ? `${tag.color}30` : 'transparent',
                        borderColor: isSelected ? tag.color : '#334155',
                        color: isSelected ? '#fff' : '#94a3b8'
                      }}
                    >
                      {tag.name} {isSelected && <span className="ml-1">×</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-500 text-center">Changes are saved automatically.</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}