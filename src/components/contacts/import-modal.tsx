'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeByPhone,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle, XCircle, AlertTriangle, FolderPlus } from 'lucide-react';
import type { CustomField } from '@/types';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  customFieldsMap?: Record<string, string>;
}

function parseFullCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentField.trim());
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || row.length > 0) {
    row.push(currentField.trim());
    if (row.length > 1 || row[0] !== '') {
      result.push(row);
    }
  }

  return result;
}

function parseCSV(
  text: string,
  dynamicCustomFields: CustomField[],
  onError: (msg: string) => void
): ParsedRow[] | null {
  const records = parseFullCSV(text);
  if (records.length < 2) return [];

  const headers = records[0].map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  const phoneIdx = headers.indexOf('phone');
  if (phoneIdx === -1) {
    onError('No valid rows found. Ensure CSV has a "phone" column header.');
    return null;
  }

  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const companyIdx = headers.indexOf('company');

  const customFieldMappings: { id: string; index: number }[] = [];

  for (const cf of dynamicCustomFields) {
    const normalizedCrmName = cf.field_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let fileIndex = headers.indexOf(normalizedCrmName);

    if (fileIndex === -1 && normalizedCrmName.includes('unit')) {
      fileIndex = headers.indexOf('unit');
    }
    if (fileIndex === -1 && (normalizedCrmName.includes('comment') || normalizedCrmName.includes('view') || normalizedCrmName.includes('remark'))) {
      fileIndex = headers.indexOf('view');
    }
    if (fileIndex === -1 && normalizedCrmName.includes('cluster')) {
      fileIndex = headers.indexOf('cluster');
    }
    if (fileIndex === -1 && normalizedCrmName.includes('bedroom')) {
      fileIndex = headers.indexOf('bedrooms');
    }

    if (fileIndex !== -1) {
      customFieldMappings.push({ id: cf.id, index: fileIndex });
    }
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length === 0 || values.length <= phoneIdx) continue;

    const phone = values[phoneIdx].trim().replace(/[\s\t\r\n]/g, '');
    if (!phone) continue;

    const customFieldsMap: Record<string, string> = {};
    customFieldMappings.forEach((m) => {
      const val = values[m.index];
      if (val && val !== '-') {
        customFieldsMap[m.id] = val.trim();
      }
    });

    rows.push({
      phone,
      name: nameIdx >= 0 ? values[nameIdx]?.trim() || undefined : undefined,
      email: emailIdx >= 0 ? values[emailIdx]?.trim() || undefined : undefined,
      company: companyIdx >= 0 ? values[companyIdx]?.trim() || undefined : undefined,
      customFieldsMap,
    });
  }

  return rows;
}

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const supabase = createClient();
  const { accountId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dbCustomFields, setDbCustomFields] = useState<CustomField[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from('custom_fields').select('*').order('field_name');
      setDbCustomFields(data || []);
    })();
  }, [open, supabase]);

  function reset() {
    setFile(null);
    setFolderName('');
    setParsedRows([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const fallbackName = selected.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    setFolderName(fallbackName);

    const text = await selected.text();
    const rows = parseCSV(text, dbCustomFields, (errorMessage) => {
      toast.error(errorMessage);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    if (rows === null) {
      setParsedRows([]);
      return;
    }
    setParsedRows(rows);
  }

  async function insertContactCustomFields(contactId: string, customMap?: Record<string, string>) {
    if (!customMap || Object.keys(customMap).length === 0) return;

    const childRows = Object.entries(customMap).map(([fieldId, value]) => ({
      contact_id: contactId,
      custom_field_id: fieldId,
      value: value,
    }));

    await supabase.from('contact_custom_values').insert(childRows);
  }

  async function handleImport() {
    if (parsedRows.length === 0 || !accountId) return;
    if (!folderName.trim()) {
      toast.error('Please assign an Import Folder Name to group these contacts.');
      return;
    }
    setImporting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      let targetTagId = '';
      const cleanFolderName = folderName.trim();

      const { data: existingTags } = await supabase
        .from('tags')
        .select('id')
        .eq('account_id', accountId)
        .ilike('name', cleanFolderName);

      if (existingTags && existingTags.length > 0) {
        targetTagId = existingTags[0].id;
      } else {
        const colors = ['#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        // Inserts tag safely
        const { error: tagErr } = await supabase
          .from('tags')
          .insert({
            account_id: accountId,
            name: cleanFolderName,
            color: randomColor
          });

        if (tagErr) throw tagErr;

        // Re-queries to get the safe record without relying on return pointers
        const { data: verifiedTags } = await supabase
          .from('tags')
          .select('id')
          .eq('account_id', accountId)
          .ilike('name', cleanFolderName);

        if (!verifiedTags || verifiedTags.length === 0) {
          throw new Error('Folder reference initialization error.');
        }
        targetTagId = verifiedTags[0].id;
      }

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      const { unique, duplicates: inFileDupes } = dedupeByPhone(parsedRows);
      skipped += inFileDupes;

      const { data: existingRows } = await supabase
        .from('contacts')
        .select('id, phone, phone_normalized')
        .eq('account_id', accountId);

      const existingPhoneMap = new Map<string, string>();
      existingRows?.forEach(r => {
        if (r.phone_normalized) existingPhoneMap.set(r.phone_normalized, r.id);
        if (r.phone) existingPhoneMap.set(normalizeKey(r.phone), r.id);
      });

      for (const row of unique) {
        try {
          const normalizedPhone = normalizeKey(row.phone);
          let contactId = existingPhoneMap.get(normalizedPhone);

          if (contactId) {
            skipped++;
            const { data: existingLinks } = await supabase
              .from('contact_tags')
              .select('contact_id')
              .eq('contact_id', contactId)
              .eq('tag_id', targetTagId);

            if (!existingLinks || existingLinks.length === 0) {
              await supabase.from('contact_tags').insert({
                contact_id: contactId,
                tag_id: targetTagId
              });
            }
          } else {
            const contactPayload: Record<string, any> = {
              user_id: user.id,
              account_id: accountId,
              phone: row.phone,
              name: row.name || null,
              email: row.email || null,
            };

            const { error: insertErr } = await supabase
              .from('contacts')
              .insert(contactPayload);

            if (insertErr && (insertErr.code === '23505' || insertErr.message?.includes('unique'))) {
              skipped++;
              continue;
            }

            // Fetches the newly generated contact record back from database references safely
            const { data: verifiedContacts } = await supabase
              .from('contacts')
              .select('id')
              .eq('account_id', accountId)
              .eq('phone', row.phone);

            if (!insertErr && verifiedContacts && verifiedContacts.length > 0) {
              imported++;
              contactId = verifiedContacts[0].id;
              await insertContactCustomFields(contactId, row.customFieldsMap);
              await supabase.from('contact_tags').insert({
                contact_id: contactId,
                tag_id: targetTagId
              });
            } else {
              failed++;
            }
          }
        } catch (innerErr) {
          failed++;
        }
      }

      setResult({ imported, skipped, failed });
      if (imported > 0 || skipped > 0) {
        toast.success(`Processing complete for folder group: ${cleanFolderName}`);
        onImported();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-[95vw] sm:max-w-xl md:max-w-2xl overflow-hidden shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FolderPlus className="size-5 text-primary" /> Import Contacts into Folder
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Upload a spreadsheet file. Contacts will be cleanly organized and grouped inside a dedicated folder view segment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-w-full overflow-hidden">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 p-6 cursor-pointer hover:border-primary/50 transition-colors bg-slate-950/20"
          >
            {file ? (
              <>
                <FileText className="size-8 text-primary" />
                <p className="text-sm text-slate-300 truncate max-w-full px-2">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} detected
                </p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-slate-500" />
                <p className="text-sm text-slate-400">Click to upload CSV file</p>
                <p className="text-xs text-slate-500">CSV with &quot;phone&quot; column header required</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {file && !result && (
            <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <Label htmlFor="folder" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                Import Folder Name (Creates new or appends to existing)
              </Label>
              <Input
                id="folder"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g., Santorini Townhouses June"
                className="border-slate-700 bg-slate-900 text-white focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {preview.length > 0 && !result && (
            <div className="space-y-2 max-w-full">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Preview (first {preview.length} rows)
              </p>
              <div className="rounded-lg border border-slate-700 w-full overflow-x-auto bg-slate-950/50 scrollbar-thin">
                <table className="w-full text-xs min-w-[600px] table-fixed">
                  <thead>
                    <tr className="bg-slate-800 border-b border-slate-700">
                      <th className="px-3 py-2 text-left text-slate-400 font-medium w-[130px]">Phone</th>
                      <th className="px-3 py-2 text-left text-slate-400 font-medium w-[120px]">Name</th>
                      <th className="px-3 py-2 text-left text-slate-400 font-medium w-[140px]">Email</th>
                      {dbCustomFields.map((cf) => (
                        <th key={cf.id} className="px-3 py-2 text-left text-amber-400 font-medium uppercase w-[120px] truncate">
                          {cf.field_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-slate-800 hover:bg-slate-900/30">
                        <td className="px-3 py-2 text-slate-300 font-mono truncate">{row.phone}</td>
                        <td className="px-3 py-2 text-slate-300 truncate">{row.name || '-'}</td>
                        <td className="px-3 py-2 text-slate-300 truncate">{row.email || '-'}</td>
                        {dbCustomFields.map((cf) => (
                          <td key={cf.id} className="px-3 py-2 text-slate-400 font-mono truncate max-w-[150px]">
                            {row.customFieldsMap?.[cf.id] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-slate-700 p-4 space-y-2 bg-slate-950/30">
              <p className="text-sm font-medium text-white">Import Complete</p>
              <div className="flex flex-wrap items-center gap-4">
                {result.imported > 0 && (
                  <div className="flex items-center gap-1.5 text-primary text-sm">
                    <CheckCircle className="size-4" /> {result.imported} new contacts imported
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-400 text-sm">
                    <AlertTriangle className="size-4" /> {result.skipped} existing contacts assigned to folder
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400 text-sm">
                    <XCircle className="size-4" /> {result.failed} records failed
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="bg-slate-900 border-t border-slate-800/60 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing || !folderName.trim()}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-40"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              Process Group Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}