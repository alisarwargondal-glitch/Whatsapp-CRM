'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Folder, Users, ArrowLeft, Settings2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Define our strict types based on your schema
interface FolderTag {
  id: string;
  name: string;
  color: string;
  count?: number;
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

  // Navigation State
  const [activeFolder, setActiveFolder] = useState<FolderTag | null>(null);

  // Data State
  const [folders, setFolders] = useState<FolderTag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    phone: true,
    name: true,
    email: true,
    company: true,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // 1. Fetch Folders (Tags) on initial load
  useEffect(() => {
    if (!accountId) return;

    async function loadFolders() {
      setLoading(true);
      // Fetch tags and the count of contacts inside them
      const { data: tagsData } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('account_id', accountId)
        .order('name');

      if (tagsData) {
        // Optional: You can do a separate count query here if you want to show contact counts on the folders
        setFolders(tagsData);
      }

      // Load custom fields to populate the column toggles
      const { data: fieldsData } = await supabase
        .from('custom_fields')
        .select('id, field_name')
        .order('field_name');

      if (fieldsData) {
        setCustomFields(fieldsData);
        // Add custom fields to our visibility state (default to true)
        const newCols = { ...visibleColumns };
        fieldsData.forEach(field => {
          if (newCols[field.id] === undefined) newCols[field.id] = true;
        });
        setVisibleColumns(newCols);
      }
      setLoading(false);
    }

    loadFolders();
  }, [accountId, supabase]);

  // 2. Fetch Contacts when a Folder is clicked
  useEffect(() => {
    if (!activeFolder || !accountId) return;

    async function loadFolderContacts() {
      setLoading(true);

      // Fetch links
      const { data: links } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', activeFolder.id);

      if (!links || links.length === 0) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const contactIds = links.map(l => l.contact_id);

      // Fetch actual contacts
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('*')
        .in('id', contactIds);

      // Fetch custom values for these contacts
      const { data: customValuesData } = await supabase
        .from('contact_custom_values')
        .select('*')
        .in('contact_id', contactIds);

      // Map custom values into the contact objects
      if (contactsData) {
        const formattedContacts = contactsData.map(c => {
          const cVals = customValuesData?.filter(cv => cv.contact_id === c.id) || [];
          const customMap: Record<string, string> = {};
          cVals.forEach(cv => {
            customMap[cv.custom_field_id] = cv.value;
          });
          return { ...c, custom_values: customMap };
        });
        setContacts(formattedContacts);
      }
      setLoading(false);
    }

    loadFolderContacts();
  }, [activeFolder, accountId, supabase]);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- VIEW 1: FOLDER GRID ---
  if (!activeFolder) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Contact Folders</h1>
            <p className="text-slate-400 text-sm">Select a directory to view your imported groups.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : folders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-700 rounded-xl bg-slate-900/50">
            <Folder className="size-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-white font-medium">No Folders Found</h3>
            <p className="text-slate-400 text-sm mt-1">Upload a CSV to generate your first contact folder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => setActiveFolder(folder)}
                className="group cursor-pointer bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary/50 hover:bg-slate-800/80 transition-all duration-200 shadow-sm hover:shadow-primary/10 flex flex-col items-center text-center space-y-3"
              >
                <div
                  className="size-12 rounded-full flex items-center justify-center bg-opacity-20"
                  style={{ backgroundColor: `${folder.color}20`, color: folder.color || '#3b82f6' }}
                >
                  <Folder className="size-6" />
                </div>
                <div>
                  <h3 className="text-slate-200 font-semibold truncate px-2 max-w-[200px]" title={folder.name}>
                    {folder.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- VIEW 2: INSIDE A FOLDER ---
  return (
    <div className="p-6 max-w-[100vw] mx-auto space-y-4 flex flex-col h-screen">
      {/* Header Bar */}
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

          {/* Column Visibility Filter */}
          <div className="relative">
            <Button
              variant="outline"
              className="border-slate-700 bg-slate-950 text-slate-300"
              onClick={() => setShowColumnMenu(!showColumnMenu)}
            >
              <Settings2 className="size-4 mr-2" /> Columns
            </Button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2 overflow-hidden">
                <div className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2">Display Fields</div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin">
                  {['name', 'phone', 'email', 'company'].map(key => (
                    <label key={key} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() => toggleColumn(key)}
                        className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-slate-300 capitalize">{key}</span>
                    </label>
                  ))}
                  {customFields.map(cf => (
                    <label key={cf.id} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns[cf.id]}
                        onChange={() => toggleColumn(cf.id)}
                        className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-slate-300 capitalize truncate">{cf.field_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resizable Data Table */}
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
              <thead className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-800 text-slate-400 z-10">
                <tr>
                  {visibleColumns['name'] && (
                    <th className="px-4 py-3 font-medium truncate" style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '150px' }}>Name</th>
                  )}
                  {visibleColumns['phone'] && (
                    <th className="px-4 py-3 font-medium truncate" style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '150px' }}>Phone</th>
                  )}
                  {visibleColumns['email'] && (
                    <th className="px-4 py-3 font-medium truncate" style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '200px' }}>Email</th>
                  )}
                  {visibleColumns['company'] && (
                    <th className="px-4 py-3 font-medium truncate" style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '150px' }}>Company</th>
                  )}
                  {customFields.filter(cf => visibleColumns[cf.id]).map(cf => (
                    <th key={cf.id} className="px-4 py-3 font-medium text-amber-500/80 truncate" style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '150px' }}>
                      {cf.field_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-800/50 transition-colors">
                    {visibleColumns['name'] && <td className="px-4 py-3 text-white">{contact.name || '-'}</td>}
                    {visibleColumns['phone'] && <td className="px-4 py-3 text-slate-300 font-mono">{contact.phone}</td>}
                    {visibleColumns['email'] && <td className="px-4 py-3 text-slate-400">{contact.email || '-'}</td>}
                    {visibleColumns['company'] && <td className="px-4 py-3 text-slate-400">{contact.company || '-'}</td>}

                    {customFields.filter(cf => visibleColumns[cf.id]).map(cf => (
                      <td key={cf.id} className="px-4 py-3 text-slate-400 truncate max-w-[200px]">
                        {contact.custom_values?.[cf.id] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}