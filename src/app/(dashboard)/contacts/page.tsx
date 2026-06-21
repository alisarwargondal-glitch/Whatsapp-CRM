### Spot on.

Two things happened here:

1. ** The Error:** Your Supabase `contacts` table has a strict security rule requiring every contact to be linked to a`user_id`(and likely an`account_id`).Because my previous code didn't pass those IDs into the `insert` function, Supabase rejected the save to protect your database.
2. ** The Custom Fields:** It makes complete sense to have all your dynamically generated custom fields available in this manual entry modal so you don't have to add them later.

I've updated the code to automatically inject the missing `user_id` and `account_id` during the save, and I've wired your `customFields` state directly into the form.When you hit save, it will now create the contact and instantly map any custom data into your `contact_custom_values` table.

### The Fix

Open your contacts page file again(`src/app/contacts/page.tsx`) and ** replace all of the code ** with this updated version:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { 
  Folder, Users, ArrowLeft, Settings2, Search, 
  Loader2, GripHorizontal, X, Upload, Trash2, 
  Tag as TagIcon, ArrowUpDown, UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ImportModal } from '@/components/contacts/import-modal';

const hideResizeHandleStyles = `*:: -webkit - resizer { display: none!important; } textarea: focus, input:focus { outline: none!important; } `;

function EditableInput({ initialValue, onSave }: { initialValue: string, onSave: (val: string) => void }) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => setVal(initialValue), [initialValue]);
  return <input value={val} onChange={e => setVal(e.target.value)} onBlur={() => { if (val !== initialValue) onSave(val); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full bg-transparent text-sm text-slate-300 outline-none focus:ring-1 focus:ring-primary focus:bg-slate-900 rounded px-1.5 py-1 border border-transparent hover:border-slate-700/50" />;
}

function EditableTextarea({ initialValue, onSave }: { initialValue: string, onSave: (val: string) => void }) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => setVal(initialValue), [initialValue]);
  return <textarea value={val} onChange={e => setVal(e.target.value)} onBlur={() => { if (val !== initialValue) onSave(val); }} rows={1} className="w-full bg-transparent text-sm text-slate-300 outline-none focus:ring-1 focus:ring-primary focus:bg-slate-900 rounded px-1.5 py-1 border border-transparent hover:border-slate-700/50 resize-none min-h-[32px] overflow-hidden" />;
}

export default function ContactsDirectory() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [activeFolder, setActiveFolder] = useState<any>(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ column: string | null, direction: 'asc' | 'desc' | null }>({ column: null, direction: null });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // UPDATED: Added custom_values dictionary to state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', company: '', folder_id: '', custom_values: {} as Record<string, string> });

  const [columnOrder, setColumnOrder] = useState(['name', 'phone', 'tags', 'email', 'company']);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({ name: true, phone: true, tags: true, email: true, company: true });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showTagFilterMenu, setShowTagFilterMenu] = useState(false);
  const [editingTagsFor, setEditingTagsFor] = useState<any>(null);

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
    setSelectedContacts(new Set());
    setSearchQuery('');
    setTagFilter([]);
  }, [activeFolder?.id]);

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
    if (!activeFolder?.id || !accountId) return;
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
        const myTags = contactTagsData?.filter(ct => ct.contact_id === c.id).map(ct => Array.isArray(ct.tags) ? ct.tags[0] : ct.tags).filter(Boolean) || [];
        return { ...c, custom_values: customMap, tags: myTags };
      });
      setContacts(formattedContacts);
      setLoading(false);
    }
    loadFolderContacts();
  }, [activeFolder?.id, accountId, supabase]);

  const handleSort = (column: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') direction = 'desc';
    if (sortConfig.column === column && sortConfig.direction === 'desc') direction = null;
    const newSort = { column: direction ? column : null, direction };
    setSortConfig(newSort);
    localStorage.setItem('crm_sort_config', JSON.stringify(newSort));
  };

  const processedContacts = contacts.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (c.name?.toLowerCase().includes(q) || c.phone.includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || Object.values(c.custom_values || {}).some((v: any) => String(v).toLowerCase().includes(q)));
    const matchesTags = tagFilter.length === 0 || c.tags?.some((t: any) => tagFilter.includes(t.id));
    return matchesSearch && matchesTags;
  }).sort((a, b) => {
    if (!sortConfig.column || !sortConfig.direction) return 0;
    const valA = (['name', 'phone', 'email', 'company'].includes(sortConfig.column) ? (a as any)[sortConfig.column] : (sortConfig.column === 'tags' ? a.tags?.map((t: any) => t.name).join('') : a.custom_values?.[sortConfig.column])) || '';
    const valB = (['name', 'phone', 'email', 'company'].includes(sortConfig.column) ? (b as any)[sortConfig.column] : (sortConfig.column === 'tags' ? b.tags?.map((t: any) => t.name).join('') : b.custom_values?.[sortConfig.column])) || '';
    return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const toggleFilterTag = (tagId: string) => setTagFilter(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  const toggleSelectAll = () => setSelectedContacts(selectedContacts.size === processedContacts.length && processedContacts.length > 0 ? new Set() : new Set(processedContacts.map(c => c.id)));
  const toggleSelectRow = (id: string) => { const next = new Set(selectedContacts); next.has(id) ? next.delete(id) : next.add(id); setSelectedContacts(next); };

  async function handleBulkDelete() {
    if (!confirm(`Delete ${ selectedContacts.size } contacts ? This cannot be undone.`)) return;
    const ids = Array.from(selectedContacts);
    const { error } = await supabase.from('contacts').delete().in('id', ids);
    if (error) toast.error("Failed to delete.");
    else { toast.success(`${ ids.length } contacts deleted.`); setContacts(prev => prev.filter(c => !selectedContacts.has(c.id))); setSelectedContacts(new Set()); }
  }

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => { const next = { ...prev, [colId]: !prev[colId] }; localStorage.setItem('crm_col_vis', JSON.stringify(next)); return next; });
  };

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("⚠️ WARNING: This deletes the folder AND all contacts inside it. Proceed?")) return;
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) return toast.error("Failed to delete folder");
    toast.success("Folder deleted.");
    setFolders(prev => prev.filter(f => f.id !== folderId));
  }

  async function handleUpdateFolderName(folderId: string, newName: string) {
    if (!newName.trim()) return;
    setFolders((prev: any[]) => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    const { error } = await supabase.from('folders').update({ name: newName.trim() }).eq('id', folderId);
    if (error) toast.error("Failed to rename folder.");
  }

  async function handleInlineSave(contactId: string, colId: string, newValue: string, isDefault: boolean) {
    setContacts(prev => prev.map(c => {
      if (c.id !== contactId) return c;
      if (isDefault) return { ...c, [colId]: newValue };
      return { ...c, custom_values: { ...c.custom_values, [colId]: newValue } };
    }));
    if (isDefault) {
      await supabase.from('contacts').update({ [colId]: newValue }).eq('id', contactId);
    } else {
      await supabase.from('contact_custom_values').upsert({ contact_id: contactId, custom_field_id: colId, value: newValue }, { onConflict: 'contact_id, custom_field_id' });
    }
  }

  async function toggleInlineTag(contactId: string, tag: any) {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    const hasTag = contact.tags?.some((t: any) => t.id === tag.id);
    let newTags = contact.tags || [];
    if (hasTag) {
      newTags = newTags.filter((t: any) => t.id !== tag.id);
      await supabase.from('contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tag.id);
    } else {
      newTags = [...newTags, tag];
      await supabase.from('contact_tags').insert({ contact_id: contactId, tag_id: tag.id });
    }
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags: newTags } : c));
    setEditingTagsFor(prev => prev ? { ...prev, tags: newTags } : null);
  }

  // UPDATED: Handle Manual Contact Submit with Constraints & Custom Fields
  async function handleManualAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newContact.phone || !newContact.folder_id) return toast.error("Phone number and Folder are required.");
    
    setIsAddingContact(true);
    
    // 1. Insert Base Contact (Fixing the user_id constraint error)
    const { data: insertedContact, error: contactError } = await supabase.from('contacts').insert([{
      name: newContact.name,
      phone: newContact.phone,
      email: newContact.email,
      company: newContact.company,
      folder_id: newContact.folder_id,
      user_id: accountId,     // Satisfies the constraint
      account_id: accountId   // Ensures multi-tenant safety
    }]).select().single();

    if (contactError) {
      setIsAddingContact(false);
      return toast.error("Failed to add contact: " + contactError.message);
    }

    // 2. Insert Custom Fields if any are populated
    const customValueInserts = Object.entries(newContact.custom_values)
      .filter(([_, value]) => value && value.trim() !== '')
      .map(([fieldId, value]) => ({
        contact_id: insertedContact.id,
        custom_field_id: fieldId,
        value: value.trim()
      }));

    if (customValueInserts.length > 0) {
      const { error: customError } = await supabase.from('contact_custom_values').insert(customValueInserts);
      if (customError) {
        toast.error("Contact saved, but custom fields failed to process.");
      }
    }

    setIsAddingContact(false);
    toast.success("Contact added successfully.");
    setIsAddContactOpen(false);
    
    // Reset form
    setNewContact({ name: '', phone: '', email: '', company: '', folder_id: '', custom_values: {} });
    
    // Inject directly into UI if the user is currently viewing the folder they just saved to
    if (activeFolder && activeFolder.id === newContact.folder_id) {
      setContacts(prev => [{ ...insertedContact, custom_values: newContact.custom_values, tags: [] }, ...prev]);
    }
  }

  const handleDragStart = (e: React.DragEvent, colId: string) => e.dataTransfer.setData('text/plain', colId);
  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const sourceColId = e.dataTransfer.getData('text/plain');
    if (sourceColId === targetColId) return;
    const newOrder = [...columnOrder];
    newOrder.splice(newOrder.indexOf(sourceColId), 1);
    newOrder.splice(newOrder.indexOf(targetColId), 0, sourceColId);
    setColumnOrder(newOrder);
    localStorage.setItem('crm_col_order', JSON.stringify(newOrder));
  };
  const handleMouseUpResize = (colId: string, e: React.MouseEvent) => {
    const newWidth = Math.round(e.currentTarget.getBoundingClientRect().width);
    if (columnWidths[colId] !== newWidth) {
      setColumnWidths(prev => { const next = { ...prev, [colId]: newWidth }; localStorage.setItem('crm_col_widths', JSON.stringify(next)); return next; });
    }
  };
  const handleDoubleClickResize = (colId: string) => {
    setColumnWidths(prev => { const next = { ...prev, [colId]: -1 }; localStorage.setItem('crm_col_widths', JSON.stringify(next)); return next; });
  };

  function getColumnLabel(colId: string) {
    if (['name', 'phone', 'email', 'company', 'tags'].includes(colId)) return colId.charAt(0).toUpperCase() + colId.slice(1);
    return customFields.find(cf => cf.id === colId)?.field_name || colId;
  }

  function renderInlineCell(contact: any, col: string) {
    if (col === 'tags') {
      return (
        <div onClick={() => setEditingTagsFor(contact)} className="flex flex-wrap gap-1 py-1 cursor-pointer hover:bg-slate-800/50 rounded px-1.5 min-h-[32px] items-center border border-transparent hover:border-slate-700/50 transition-all">
          {(!contact.tags || contact.tags.length === 0) ? <span className="text-slate-600 italic text-xs px-1">+ Add tags</span> :
            contact.tags.map((t: any) => <span key={t.id} className="px-1.5 py-0.5 rounded text-[11px] font-medium border border-transparent whitespace-nowrap" style={{ backgroundColor: `${ t.color } 20`, color: t.color, borderColor: `${ t.color } 40` }}>{t.name}</span>)
          }
        </div>
      );
    }
    const isDefault = ['name', 'phone', 'email', 'company'].includes(col);
    const initialValue = isDefault ? (contact[col] || '') : (contact.custom_values?.[col] || '');
    if (isDefault) return <EditableInput initialValue={initialValue} onSave={(val) => handleInlineSave(contact.id, col, val, true)} />;
    return <EditableTextarea initialValue={initialValue} onSave={(val) => handleInlineSave(contact.id, col, val, false)} />;
  }

  // --- UPDATED MODAL COMPONENT (Now maps custom fields dynamically) ---
  const AddContactModal = (
    <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader><DialogTitle>Add New Contact manually</DialogTitle></DialogHeader>
        <form onSubmit={handleManualAddSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-slate-300">Assign to Folder *</Label>
            <select 
              required
              value={newContact.folder_id} 
              onChange={e => setNewContact({...newContact, folder_id: e.target.value})}
              className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="" disabled>Select a folder...</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          
          {/* Base Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Full Name</Label>
              <Input value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} className="bg-slate-950 border-slate-700 focus:border-primary" placeholder="e.g. Ali Ahmed" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Phone *</Label>
              <Input required value={newContact.phone} onChange={e => setNewContact({...newContact, phone: e.target.value})} className="bg-slate-950 border-slate-700 focus:border-primary" placeholder="+971501234567" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Email Address</Label>
              <Input type="email" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="bg-slate-950 border-slate-700 focus:border-primary" placeholder="ali@example.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Company</Label>
              <Input value={newContact.company} onChange={e => setNewContact({...newContact, company: e.target.value})} className="bg-slate-950 border-slate-700 focus:border-primary" placeholder="Acme Real Estate" />
            </div>

            {/* Custom Fields Dynamically Mapped Here */}
            {customFields.length > 0 && (
              <div className="col-span-2 mt-4 space-y-4">
                <div className="text-xs font-semibold text-slate-400 uppercase border-b border-slate-800 pb-1">Custom Fields</div>
                <div className="grid grid-cols-2 gap-4">
                  {customFields.map(field => (
                    <div key={field.id} className="space-y-2">
                      <Label className="text-slate-300">{field.field_name}</Label>
                      <Input 
                        value={newContact.custom_values[field.id] || ''} 
                        onChange={e => setNewContact({
                          ...newContact, 
                          custom_values: { ...newContact.custom_values, [field.id]: e.target.value }
                        })} 
                        className="bg-slate-950 border-slate-700 focus:border-primary" 
                        placeholder={`Enter ${ field.field_name }...`} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-6 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsAddContactOpen(false)} className="text-slate-400 hover:text-white">Cancel</Button>
            <Button type="submit" disabled={isAddingContact} className="bg-primary text-white hover:bg-primary/90">
              {isAddingContact ? <Loader2 className="size-4 animate-spin mr-2" /> : <UserPlus className="size-4 mr-2" />}
              Save Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (!activeFolder) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <style>{hideResizeHandleStyles}</style>
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-white">Contact Folders</h1><p className="text-slate-400 text-sm">Select a directory to view your imported groups.</p></div>
          <div className="flex items-center gap-3">
            <Button onClick={() => { setNewContact({ name: '', phone: '', email: '', company: '', folder_id: '', custom_values: {} }); setIsAddContactOpen(true); }} className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"><UserPlus className="size-4 mr-2" /> Add Contact</Button>
            <Button onClick={() => setIsImportOpen(true)} className="bg-primary hover:bg-primary/90 text-white"><Upload className="size-4 mr-2" /> Import CSV</Button>
          </div>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div> : folders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-700 rounded-xl bg-slate-900/50 flex flex-col items-center">
            <Folder className="size-12 text-slate-600 mb-3" />
            <h3 className="text-white font-medium">No Folders Found</h3>
            <p className="text-slate-400 text-sm mt-1 mb-4">Upload a CSV file to automatically generate your first folder.</p>
            <Button onClick={() => setIsImportOpen(true)} className="bg-primary hover:bg-primary/90 text-white"><Upload className="size-4 mr-2" /> Upload CSV</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folders.map(folder => (
              <div key={folder.id} onClick={() => setActiveFolder(folder)} className="relative group cursor-pointer bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary/50 hover:bg-slate-800/80 transition-all shadow-sm flex flex-col items-center text-center space-y-3">
                <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="absolute top-2 right-2 p-1.5 rounded-md bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all"><X className="size-4" /></button>
                <div className="size-12 rounded-full flex items-center justify-center bg-opacity-20" style={{ backgroundColor: `${ folder.color } 20`, color: folder.color || '#3b82f6' }}><Folder className="size-6" /></div>
                <h3 className="text-slate-200 font-semibold truncate px-2 w-full">{folder.name}</h3>
              </div>
            ))}
          </div>
        )}
        <ImportModal open={isImportOpen} onOpenChange={setIsImportOpen} onImported={() => window.location.reload()} folders={folders} />
        {AddContactModal}
      </div>
    );
  }

  const visibleOrderedCols = columnOrder.filter(col => visibleColumns[col]);
  const defaultCols = ['name', 'phone', 'tags', 'email', 'company'];
  const customCols = columnOrder.filter(col => !defaultCols.includes(col));

  return (
    <div className="p-6 max-w-[100vw] mx-auto space-y-4 flex flex-col h-screen">
      <style>{hideResizeHandleStyles}</style>

      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveFolder(null)} className="text-slate-400 hover:text-white"><ArrowLeft className="size-5" /></Button>
          <div className="flex items-center gap-3">
            <Folder className="size-6" style={{ color: activeFolder.color || '#3b82f6' }} />
            <div>
              <input
                value={activeFolder.name}
                onChange={(e) => setActiveFolder({ ...activeFolder, name: e.target.value })}
                onBlur={(e) => handleUpdateFolderName(activeFolder.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="text-xl font-bold text-white leading-tight bg-transparent border border-transparent hover:border-slate-700 focus:border-primary focus:bg-slate-900 rounded px-1 -ml-1 outline-none transition-all w-full max-w-[300px]"
              />
              <p className="text-slate-400 text-xs">{contacts.length} records inside</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          <Button onClick={() => { setNewContact({ name: '', phone: '', email: '', company: '', folder_id: activeFolder.id, custom_values: {} }); setIsAddContactOpen(true); }} className="bg-primary hover:bg-primary/90 text-white"><UserPlus className="size-4 mr-2" /> Add Contact</Button>

          {selectedContacts.size > 0 && <Button variant="destructive" onClick={handleBulkDelete} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30"><Trash2 className="size-4 mr-2" /> Delete ({selectedContacts.size})</Button>}
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input placeholder="Deep Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-64 pl-9 bg-slate-950 border-slate-700 text-sm text-white focus:border-primary" />
            {searchQuery && <X className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer hover:text-white" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="relative" ref={tagMenuRef}>
            <Button variant="outline" className={`border - slate - 700 bg - slate - 950 text - slate - 300 ${ tagFilter.length > 0 ? 'border-primary/50 text-primary' : '' } `} onClick={() => setShowTagFilterMenu(!showTagFilterMenu)}>
              <TagIcon className="size-4 mr-2" /> Filter Tags {tagFilter.length > 0 && <span className="ml-2 bg-primary text-white text-xs rounded-full px-1.5 py-0.5">{tagFilter.length}</span>}
            </Button>
            {showTagFilterMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2 flex flex-col">
                <div className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2 pt-2">Filter by Automations</div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin pb-2">
                  {allTags.map(tag => (
                    <label key={tag.id} className="flex items-center gap-2 p-2 mx-1 hover:bg-slate-800 rounded cursor-pointer">
                      <input type="checkbox" checked={tagFilter.includes(tag.id)} onChange={() => toggleFilterTag(tag.id)} className="rounded border-slate-600 text-primary focus:ring-primary bg-slate-900" />
                      <span className="text-sm truncate" style={{ color: tag.color }}>{tag.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative" ref={colMenuRef}>
            <Button variant="outline" className="border-slate-700 bg-slate-950 text-slate-300" onClick={() => setShowColumnMenu(!showColumnMenu)}><Settings2 className="size-4 mr-2" /> Columns</Button>
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
            <p>No contacts match your current filters.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-thin w-full max-w-full">
            <table className="text-left table-fixed border-collapse w-max min-w-full">
              <thead className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 text-slate-400 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 border-r border-slate-800/50 w-[50px] shrink-0 align-top">
                    <input type="checkbox" onChange={toggleSelectAll} checked={selectedContacts.size === processedContacts.length && processedContacts.length > 0} className="rounded border-slate-600 bg-slate-900 text-primary cursor-pointer mt-1" />
                  </th>
                  {visibleOrderedCols.map(col => {
                    const colWidth = columnWidths[col] === -1 ? 'max-content' : (columnWidths[col] ? `${ columnWidths[col] } px` : '200px');
                    return (
                      <th
                        key={col}
                        data-colid={col}
                        onMouseUp={(e) => handleMouseUpResize(col, e)}
                        className="px-2 py-3 border-r border-slate-800/50 hover:bg-slate-800 transition-colors align-top group relative"
                        style={{ resize: 'horizontal', overflow: 'hidden', width: colWidth, minWidth: 60, maxWidth: 800 }}
                      >
                        <div className="flex items-center justify-between w-full h-full px-2">
                          <div draggable onDragStart={(e) => handleDragStart(e, col)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, col)} onDoubleClick={() => handleDoubleClickResize(col)} className="flex items-center gap-2 cursor-grab active:cursor-grabbing hover:text-white flex-1 overflow-hidden" title="Double-click to snap to text width">
                            <GripHorizontal className="size-3 text-slate-600 shrink-0" />
                            <span className="truncate font-medium">{getColumnLabel(col)}</span>
                          </div>
                          <button onClick={() => handleSort(col)} className={`p - 1 rounded transition - colors shrink - 0 ${ sortConfig.column === col ? 'text-primary bg-primary/10' : 'text-slate-600 hover:text-white hover:bg-slate-700' } `}>
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
                  <tr key={contact.id} className={`transition - colors group ${ selectedContacts.has(contact.id) ? 'bg-primary/10' : 'hover:bg-slate-800/40' } `}>
                    <td className="px-4 py-3 border-r border-slate-800/50 align-top">
                      <input type="checkbox" checked={selectedContacts.has(contact.id)} onChange={() => toggleSelectRow(contact.id)} className="rounded border-slate-600 bg-slate-900 text-primary cursor-pointer mt-1.5" />
                    </td>
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

      <Dialog open={!!editingTagsFor} onOpenChange={(open) => !open && setEditingTagsFor(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Assign Tags to {editingTagsFor?.name || 'Contact'}</DialogTitle></DialogHeader>
          <div className="py-4">
            {allTags.length === 0 ? <p className="text-slate-500 text-sm italic">No tags exist in your account. Create some first!</p> : (
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => {
                  const isSelected = editingTagsFor?.tags?.some((t: any) => t.id === tag.id);
                  return (
                    <div
                      key={tag.id}
                      onClick={() => toggleInlineTag(editingTagsFor!.id, tag)}
                      className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border select-none hover:opacity-80"
                      style={{ backgroundColor: isSelected ? `${ tag.color } 30` : 'transparent', borderColor: isSelected ? tag.color : '#334155', color: isSelected ? '#fff' : '#94a3b8' }}
                    >
                      {tag.name} {isSelected && <span className="ml-1">×</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ImportModal open={isImportOpen} onOpenChange={setIsImportOpen} onImported={() => window.location.reload()} folders={folders} />
      {AddContactModal}
    </div>
  );
}

```