'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, CheckCircle2, FileText, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

interface ImportResult {
  total: number;
  success: number;
  skipped: { phone: string; name: string; reason: string }[];
}

export function ImportModal({ open, onOpenChange, onImported, folders = [] }: { open: boolean, onOpenChange: (o: boolean) => void, onImported: () => void, folders?: any[] }) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('new');
  const [folderName, setFolderName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setFolderName('');
    setSelectedFolderId('new');
    setResults(null);
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (results && results.success > 0) {
      onImported();
    }
    resetState();
    onOpenChange(false);
  };

  const processCSV = async () => {
    if (!file) return toast.error("Please provide a CSV file.");
    if (selectedFolderId === 'new' && !folderName.trim()) return toast.error("Please provide a new folder name.");

    setIsProcessing(true);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error("CSV appears to be empty or missing headers.");

      // 1. Fetch custom fields so we can map them dynamically!
      const { data: customFields } = await supabase.from('custom_fields').select('id, field_name');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number'));
      const nameIdx = headers.findIndex(h => h.includes('name'));
      const emailIdx = headers.findIndex(h => h.includes('email'));
      const companyIdx = headers.findIndex(h => h.includes('company'));

      if (phoneIdx === -1) throw new Error("Could not find a 'phone' column in your CSV.");

      // Build a map of any CSV headers that match your custom field names
      const cfMap = new Map();
      customFields?.forEach(cf => {
        const headerIdx = headers.findIndex(h => h === cf.field_name.toLowerCase());
        if (headerIdx !== -1) cfMap.set(headerIdx, cf.id);
      });

      // Map rows (including dynamic custom values)
      const parsedContacts = lines.slice(1).map(line => {
        // Safely split CSV ignoring commas inside quotes
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        const customValues: Record<string, string> = {};

        cfMap.forEach((fieldId, idx) => {
          if (cols[idx]) customValues[fieldId] = cols[idx];
        });

        return {
          phone: cols[phoneIdx]?.replace(/\D/g, '') || '',
          name: nameIdx !== -1 ? cols[nameIdx] : '',
          email: emailIdx !== -1 ? cols[emailIdx] : '',
          company: companyIdx !== -1 ? cols[companyIdx] : '',
          customValues
        };
      }).filter(c => c.phone !== '');

      // 2. Check for duplicates
      const { data: existingData } = await supabase.from('contacts').select('phone').eq('account_id', accountId);
      const existingPhones = new Set(existingData?.map(c => c.phone) || []);
      const toInsert = [];
      const skipped = [];

      for (const c of parsedContacts) {
        if (existingPhones.has(c.phone)) {
          skipped.push({ phone: c.phone, name: c.name, reason: "Phone number already exists in CRM" });
        } else {
          toInsert.push(c);
          existingPhones.add(c.phone);
        }
      }

      // 3. Process DB Insertions
      if (toInsert.length > 0) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        let targetFolderId = selectedFolderId;

        // Create new folder if requested
        if (targetFolderId === 'new') {
          const { data: newFolder, error: folderErr } = await supabase
            .from('folders')
            .insert({ user_id: userId, account_id: accountId, name: folderName.trim(), color: '#3b82f6' })
            .select('id').single();
          if (folderErr) throw new Error("Failed to create the folder.");
          targetFolderId = newFolder.id;
        }

        // Insert core contacts
        const dbContacts = toInsert.map(c => ({
          user_id: userId,
          account_id: accountId,
          folder_id: targetFolderId,
          phone: c.phone,
          name: c.name || null,
          email: c.email || null,
          company: c.company || null
        }));

        const { data: insertedContacts, error: insertErr } = await supabase.from('contacts').insert(dbContacts).select('id, phone');
        if (insertErr) throw new Error("Failed to insert contacts.");

        // Insert custom field values mapping
        if (insertedContacts && cfMap.size > 0) {
          const customValuesToInsert: any[] = [];
          insertedContacts.forEach(dbC => {
            const originalC = toInsert.find(c => c.phone === dbC.phone);
            if (originalC && Object.keys(originalC.customValues).length > 0) {
              Object.entries(originalC.customValues).forEach(([cfId, val]) => {
                customValuesToInsert.push({ contact_id: dbC.id, custom_field_id: cfId, value: val });
              });
            }
          });
          if (customValuesToInsert.length > 0) {
            await supabase.from('contact_custom_values').insert(customValuesToInsert);
          }
        }
      }

      setResults({ total: parsedContacts.length, success: toInsert.length, skipped: skipped });

    } catch (err: any) {
      toast.error(err.message || "Failed to process CSV file");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader><DialogTitle>{results ? "Import Complete" : "Import Contacts"}</DialogTitle></DialogHeader>

        {results ? (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center justify-center text-center space-y-2 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
              <CheckCircle2 className="size-12 text-green-500 mb-2" />
              <h2 className="text-2xl font-bold text-white">{results.success} Imported</h2>
              <p className="text-sm text-slate-400">Out of {results.total} total rows processed</p>
            </div>
            {results.skipped.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center text-yellow-500 font-medium text-sm"><AlertTriangle className="size-4 mr-2" />{results.skipped.length} Contacts Skipped (Duplicates)</div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-[150px] overflow-y-auto scrollbar-thin space-y-2">
                  {results.skipped.map((skip, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                      <div><span className="font-semibold text-slate-300">{skip.name || 'Unknown'}</span><span className="text-slate-500 ml-2 block sm:inline">{skip.phone}</span></div>
                      <span className="text-yellow-600/70">{skip.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={handleClose} className="w-full bg-primary hover:bg-primary/90 text-white">Finish & Refresh</Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Select Directory</Label>
                <select value={selectedFolderId} onChange={e => setSelectedFolderId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                  <option value="new">+ Create New Folder</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {selectedFolderId === 'new' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label className="text-slate-300">New Folder Name</Label>
                  <Input placeholder="e.g. Q3 Summer Leads" value={folderName} onChange={e => setFolderName(e.target.value)} className="bg-slate-950 border-slate-700 text-white focus:border-primary" disabled={isProcessing} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">CSV File</Label>
              <div onClick={() => !isProcessing && fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${file ? 'border-primary bg-primary/5' : 'border-slate-700 hover:border-slate-500 bg-slate-950'}`}>
                <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={isProcessing} />
                {file ? (
                  <div className="flex flex-col items-center text-primary"><FileText className="size-8 mb-2" /><span className="font-medium text-sm">{file.name}</span></div>
                ) : (
                  <div className="flex flex-col items-center text-slate-500"><UploadCloud className="size-8 mb-2 opacity-80" /><span className="font-medium text-sm text-slate-300">Click to upload CSV</span></div>
                )}
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={handleClose} disabled={isProcessing} className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
              <Button onClick={processCSV} disabled={!file || isProcessing} className="bg-primary hover:bg-primary/90 text-white min-w-[120px]">{isProcessing ? <Loader2 className="size-4 animate-spin" /> : 'Process Import'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}