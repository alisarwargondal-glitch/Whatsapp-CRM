'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
  X,
  Pencil,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import {
  extractVariableIndices,
  TEMPLATE_LIMITS,
} from '@/lib/whatsapp/template-validators';

// ... [Keep CATEGORIES, HEADER_FORMATS, categoryColors, emptyForm, COMMON_LANGUAGE_CODES, emptyButton constant definitions here exactly as before] ...
const CATEGORIES = ['Marketing', 'Utility', 'Authentication'] as const;
type HeaderFormat = 'none' | 'text' | 'image' | 'video' | 'document';
const HEADER_FORMATS: HeaderFormat[] = ['none', 'text', 'image', 'video', 'document'];
const categoryColors: Record<string, string> = { Marketing: 'bg-purple-600/20 text-purple-400 border-purple-600/30', Utility: 'bg-blue-600/20 text-blue-400 border-blue-600/30', Authentication: 'bg-amber-600/20 text-amber-400 border-amber-600/30' };
const emptyForm: TemplateFormData = { name: '', category: 'Marketing', language: 'en_US', header_format: 'none', header_content: '', header_media_url: '', header_sample: '', body_text: '', body_samples: [], footer_text: '', buttons: [] };
const COMMON_LANGUAGE_CODES = ['en_US', 'en_GB', 'en', 'es', 'es_ES', 'es_MX', 'fr', 'fr_FR', 'de', 'it', 'pt_BR', 'pt_PT', 'nl', 'pl', 'ru', 'tr', 'lt'];
interface TemplateFormData { name: string; category: MessageTemplate['category']; language: string; header_format: HeaderFormat; header_content: string; header_media_url: string; header_sample: string; body_text: string; body_samples: string[]; footer_text: string; buttons: TemplateButton[]; }

export function TemplateManager() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showHidden, setShowHidden] = useState(false); // NEW STATE
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);

  // Filter templates based on visibility
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => showHidden ? true : !t.is_hidden);
  }, [templates, showHidden]);

  // Existing useEffects and helper functions (fetchTemplates, buildSubmitPayload, etc.) remain identical to your original code
  // [Insert your existing useEffects and functions: fetchTemplates, buildSubmitPayload, etc.]
  // NOTE: You must update `fetchTemplates` to fetch the new `is_hidden` field.

  // NEW: Function to toggle visibility
  async function toggleHidden(template: MessageTemplate) {
    const { error } = await supabase
      .from('message_templates')
      .update({ is_hidden: !template.is_hidden })
      .eq('id', template.id);

    if (error) {
      toast.error('Failed to update visibility');
    } else {
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, is_hidden: !t.is_hidden } : t));
      toast.success(template.is_hidden ? 'Template unhidden' : 'Template hidden');
    }
  }

  // ... [Keep the rest of your original logic for openEdit, handleSubmit, handleSyncFromMeta, confirmDelete, updateButton, etc.] ...

  // Update the UI return to include the filter and the toggle button
  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Message Templates</h2>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2">
              <Checkbox id="show-hidden" checked={showHidden} onCheckedChange={(c) => setShowHidden(!!c)} />
              <Label htmlFor="show-hidden" className="text-sm text-slate-400">Show hidden templates</Label>
            </div>
          </div>
        </div>
        {/* ... [Rest of your header Buttons] ... */}
      </div>

      {/* ... [In your template loop, add this toggle button] ... */}
      {/* <Button variant="ghost" size="sm" onClick={() => toggleHidden(template)}>
           {template.is_hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button> */}

      {/* ... [Rest of your UI] ... */}
    </div>
  );
}