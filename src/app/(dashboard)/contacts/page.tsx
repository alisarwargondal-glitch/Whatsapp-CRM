'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Folder, Users, ArrowLeft, Settings2, Search, Loader2, GripHorizontal, Edit, X, Upload, Trash2, Tag as TagIcon, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ImportModal } from '@/components/contacts/import-modal';

// --- STYLES ---
// Inject this to hide the ugly grey resize triangles globally for the table headers
const hideResizeHandleStyles = `
  .resizable-th::-webkit-resizer {
    display: none;
  }
`;

interface FolderItem { id: string; name: string; color: string; }
interface TagItem { id: string; name: string; color: string; }
interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  custom_values?: Record<string, string>;
  tags?: TagItem[];
}
interface CustomField { id: string; field_name: string; }
type SortDirection = 'asc' | 'desc' | null;
interface SortState { column: string | null; direction: SortDirection; }

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
      className="w-full bg-transparent text-sm text-slate-300 outline-none focus:ring-1 focus:ring-primary focus:bg-slate-900 rounded px-1.5 py-1 transition-all border border-transparent hover:border-slate-700/50 resize-y min-h-[32px] scrollbar-thin"
    />
  );
}

export default function ContactsDirectory() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [activeFolder, setActiveFolder] = useState<FolderItem | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagFilterMenu, setShowTagFilterMenu] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortState>({ column: null, direction: null });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(['name', 'phone', 'tags', 'email', 'company']);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({ name: true, phone: true, tags: true, email: true, company: true });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', company: '', custom_values: {} as Record<string, string>, tags: [] as string[] });
  const [editingTagsFor, setEditingTagsFor] = useState<Contact | null>(null);

  // Menu Refs for Click-Outside
  const colMenuRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false);
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setShowTagFilterMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const savedSort = localStorage.getItem('crm_sort_config');
    if (savedSort) setSortConfig(JSON.parse(savedSort));
  }, []);

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
        fieldsData.forEach(field => { newCols[field.id] = true; newOrder.push(field.id); });

        const savedOrder = localStorage.getItem('crm_col_order');
        const savedVis = localStorage.getItem('crm_col_vis');
        const savedWidths = localStorage.getItem('crm_col_widths');
        if (savedOrder) { const parsedOrder = JSON.parse(savedOrder); const missingFields = newOrder.filter(col => !parsedOrder.includes(col)); newOrder = [...parsedOrder, ...missingFields]; }
        if (savedVis) newCols = { ...newCols, ...JSON.parse(savedVis) };
        if (savedWidths) setColumnWidths(JSON.parse(savedWidths));
        setVisibleColumns(newCols);
        setColumnOrder(newOrder);
      }
      setLoading(false);
    }
    loadInitialData();
  }, [accountId, supabase]);

  useEffect(() => {
    if (!activeFolder || !accountId) return;
    async function loadFolderContacts() {
      setLoading(true);
      const { data: contactsData } = await supabase.from('contacts').select('*').eq('folder_id', activeFolder.id);
      if (!contactsData || contactsData.length === 0) { setContacts([]); setLoading(false); return; }
      const contactIds = contactsData.map(c => c.id);
      const { data: customValuesData } = await supabase.from('contact_custom_values').select('*').in('contact_id', contactIds);
      const { data: contactTagsData } = await supabase.from('contact_tags').select('contact_id, tag_id, tags(id, name, color)').in('contact_id', contactIds);
      const formattedContacts = contactsData.map(c => {
        const cVals = customValuesData?.filter(cv => cv.contact_id === c.id) || [];
        const customMap: Record<string, string> = {};
        cVals.forEach(cv => { customMap[cv.custom_field_id] = cv.value; });
        const myTags = contactTagsData?.filter(ct => ct.contact_id === c.id).map(ct => Array.isArray(ct.tags) ? ct.tags[0] : ct.tags).filter(Boolean) as TagItem[] || [];
        return { ...c, custom_values: customMap, tags: myTags };
      });
      setContacts(formattedContacts);
      setLoading(false);
    }
    loadFolderContacts();
  }, [activeFolder, accountId, supabase]);

  const processedContacts = contacts.filter(contact => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      let matchesSearch = contact.name?.toLowerCase().includes(q) || contact.phone.includes(q) || contact.email?.toLowerCase().includes(q) || contact.company?.toLowerCase().includes(q);
      if (!matchesSearch && contact.custom_values) matchesSearch = Object.values(contact.custom_values).some(val => String(val).toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (tagFilter.length > 0) {
      if (!contact.tags || contact.tags.length === 0) return false;
      if (!contact.tags.some(t => t && tagFilter.includes(t.id))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (!sortConfig.column || !sortConfig.direction) return 0;
    let valA = (['name', 'phone', 'email', 'company'].includes(sortConfig.column) ? (a as any)[sortConfig.column] : (sortConfig.column === 'tags' ? a.tags?.map(t => t.name).join('') : a.custom_values?.[sortConfig.column])) || '';
    let valB = (['name', 'phone', 'email', 'company'].includes(sortConfig.column) ? (b as any)[sortConfig.column] : (sortConfig.column === 'tags' ? b.tags?.map(t => t.name).join('') : b.custom_values?.[sortConfig.column])) || '';
    return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  return (
    <div className="p-6 max-w-[100vw] mx-auto space-y-4 flex flex-col h-screen">
      <style>{hideResizeHandleStyles}</style>
      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveFolder(null)} className="text-slate-400 hover:text-white"><ArrowLeft className="size-5" /></Button>
          <div className="flex items-center gap-3">
            <Folder className="size-6" style={{ color: activeFolder?.color || '#3b82f6' }} />
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{activeFolder?.name || 'Folders'}</h1>
              <p className="text-slate-400 text-xs">{contacts.length} records</p>
            </div>
          </div>
        </div>
        {/* ... (rest of controls like Bulk Delete, Search, Columns) ... */}
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-auto w-full">
        <table className="text-left table-fixed border-collapse w-max min-w-full">
          {/* ... (Table content) ... */}
        </table>
      </div>
      {/* ... (Modals) ... */}
    </div>
  );
}