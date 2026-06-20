'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Folder, Users, ArrowLeft, Settings2, Search, Loader2, GripHorizontal, Edit, X, Upload } from 'lucide-react';
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

interface FolderItem {
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
}

interface CustomField {
  id: string;
  field_name: string;
}

export default function ContactsDirectory() {
  const supabase = createClient();
  const { accountId } = useAuth();

  // Navigation & Data State
  const [activeFolder, setActiveFolder] = useState<FolderItem | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Column State (Drag and Drop + Visibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(['name', 'phone', 'email', 'company']);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true, phone: true, email: true, company: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Edit State
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', company: '' });

  // 1. Fetch Folders
  useEffect(() => {
    if (!accountId) return;
    async function loadFolders() {
      setLoading(true);
      const { data: folderData } = await supabase
        .from('folders')
        .select('*')
        .eq('account_id', accountId)
        .order('name');
      if (folderData) setFolders(folderData);

      const { data: fieldsData } = await supabase
        .from('custom_fields')
        .select('id, field_name')
        .order('field_name');

      if (fieldsData) {
        setCustomFields(fieldsData);
        const newCols = { ...visibleColumns };
        const newOrder = ['name', 'phone', 'email', 'company'];
        fieldsData.forEach(field => {
          if (newCols[field.id] === undefined) newCols[field.id] = true;
          newOrder.push(field.id);
        });
        setVisibleColumns(newCols);
        setColumnOrder(newOrder);
      }
      setLoading(false);
    }
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, supabase]);

  // 2. Fetch Contacts for Active Folder
  useEffect(() => {
    if (!activeFolder || !accountId) return;
    async function loadFolderContacts() {
      setLoading(true);
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('*')
        .eq('folder_id', activeFolder.id);

      if (!contactsData || contactsData.length === 0) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const contactIds = contactsData.map(c => c.id);
      const { data: customValuesData } = await supabase
        .from('contact_custom_values')
        .select('*')
        .in('contact_id', contactIds);

      const formattedContacts = contactsData.map(c => {
        const cVals = customValuesData?.filter(cv => cv.contact_id === c.id) || [];
        const customMap: Record<string, string> = {};
        cVals.forEach(cv => { customMap[cv.custom_field_id] = cv.value; });
        return { ...c, custom_values: customMap };
      });
      setContacts(formattedContacts);
      setLoading(false);
    }
    loadFolderContacts();
  }, [activeFolder, accountId, supabase]);

  // --- ACTIONS ---

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("⚠️ WARNING: This will delete this folder AND completely erase all contacts inside it. Proceed?")) return;

    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) {
      toast.error("Failed to delete folder");
      return;
    }

    toast.success("Folder and contacts permanently deleted.");
    setFolders(prev => prev.filter(f => f.id !== folderId));
  }

  function handleEditClick(contact: Contact) {
    setEditForm({
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      company: contact.company || ''
    });
    setEditingContact(contact);
  }

  async function saveContactEdit() {
    if (!editingContact) return;
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email,
        company: editForm.company
      })
      .eq('id', editingContact.id);

    if (error) {
      toast.error("Failed to update contact");
    } else {
      toast.success("Contact updated!");
      setContacts(prev => prev.map(c => c.id === editingContact.id ? { ...c, ...editForm } : c));
      setEditingContact(null);
    }
  }

  // --- DRAG AND DROP LOGIC ---

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    e.dataTransfer.setData('text/plain', colId);
  };

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
  };

  function getColumnLabel(colId: string) {
    if (['name', 'phone', 'email', 'company'].includes(colId)) return colId.charAt(0).toUpperCase() + colId.slice(1);
    return customFields.find(cf => cf.id === colId)?.field_name || colId;
  }

  function renderCellContent(contact: Contact, col: string) {
    switch (col) {
      case 'name': return <span className="text-white font-medium">{contact.name || '-'}</span>;
      case 'phone': return <span className="text-slate-300 font-mono">{contact.phone}</span>;
      case 'email': return <span className="text-slate-400">{contact.email || '-'}</span>;
      case 'company': return <span className="text-slate-400">{contact.company || '-'}</span>;
      default: return <span className="text-slate-400 truncate block max-w-[200px]">{contact.custom_values?.[col] || '-'}</span>;
    }
  }

  // --- RENDER ---

  if (!activeFolder) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Contact Folders</h1>
            <p className="text-slate-400 text-sm">Select a directory to view your imported groups.</p>
          </div>
          {/* THE MISSING IMPORT BUTTON IS BACK! */}
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

        {/* Modal Mount */}
        <ImportModal
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          onImported={() => window.location.reload()}
        />
      </div>
    );
  }

  const visibleOrderedCols = columnOrder.filter(col => visibleColumns[col]);

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
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input placeholder="Search..." className="w-64 pl-9 bg-slate-950 border-slate-700 text-sm" />
          </div>

          <div className="relative">
            <Button variant="outline" className="border-slate-700 bg-slate-950 text-slate-300" onClick={() => setShowColumnMenu(!showColumnMenu)}>
              <Settings2 className="size-4 mr-2" /> Columns
            </Button>
            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2 overflow-hidden">
                <div className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2">Display Fields</div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin">
                  {columnOrder.map(col => (
                    <label key={col} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer">
                      <input type="checkbox" checked={visibleColumns[col] || false} onChange={() => setVisibleColumns(p => ({ ...p, [col]: !p[col] }))} className="rounded border-slate-600 text-primary focus:ring-primary bg-slate-900" />
                      <span className="text-sm text-slate-300 truncate">{getColumnLabel(col)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex justify-center items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : contacts.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-slate-500">
            <Users className="size-10 mb-2 opacity-50" />
            <p>This folder is currently empty.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto scrollbar-thin w-full">
            <table className="w-full text-sm text-left whitespace-nowrap min-w-max border-collapse">
              <thead className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 text-slate-400 z-10">
                <tr>
                  {visibleOrderedCols.map(col => (
                    <th
                      key={col}
                      className="px-2 py-3 border-r border-slate-800/50 last:border-r-0 hover:bg-slate-900 transition-colors"
                      style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '150px' }}
                    >
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, col)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, col)}
                        className="flex items-center gap-2 w-full h-full cursor-grab active:cursor-grabbing hover:text-white px-2"
                      >
                        <GripHorizontal className="size-3 text-slate-600 shrink-0" />
                        <span className="truncate font-medium">{getColumnLabel(col)}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-right sticky right-0 bg-slate-950/95 w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-800/40 transition-colors group">
                    {visibleOrderedCols.map(col => (
                      <td key={col} className="px-4 py-3">{renderCellContent(contact, col)}</td>
                    ))}
                    <td className="px-4 py-3 text-right sticky right-0 bg-slate-900 group-hover:bg-slate-800/40 border-l border-slate-800/50">
                      <Button variant="ghost" size="icon" onClick={() => handleEditClick(contact)} className="size-8 text-slate-400 hover:text-primary hover:bg-primary/10">
                        <Edit className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader><DialogTitle>Edit Contact Details</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="bg-slate-950 border-slate-700 text-white" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="bg-slate-950 border-slate-700 text-white" /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="bg-slate-950 border-slate-700 text-white" /></div>
            <div className="space-y-2"><Label>Company</Label><Input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} className="bg-slate-950 border-slate-700 text-white" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)} className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
            <Button onClick={saveContactEdit} className="bg-primary hover:bg-primary/90 text-white">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}