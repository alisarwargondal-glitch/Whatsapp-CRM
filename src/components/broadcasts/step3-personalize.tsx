'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Variable, Loader2, Info, UploadCloud, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface CustomField {
  id: string;
  field_name: string;
}

interface Step3Props {
  template: any;
  variables: Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>;
  onUpdate: (vars: Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>) => void;
  onNext: () => void;
  onBack: () => void;
  selectedVariationIdx?: number;
  onVariationChange?: (idx: number) => void;
}

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  onNext,
  onBack,
  selectedVariationIdx = 0,
  onVariationChange
}: Step3Props) {
  const supabase = createClient();
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [detectedVars, setDetectedVars] = useState<string[]>([]);

  // New State for Image Uploading
  const [uploadingImage, setUploadingImage] = useState(false);

  // 1. Fetch Custom Fields
  useEffect(() => {
    async function fetchFields() {
      const { data, error } = await supabase.from('custom_fields').select('id, field_name').order('field_name');
      if (data) {
        setCustomFields(data);
      }
      setLoading(false);
    }
    fetchFields();
  }, [supabase]);

  // 2. Parse Template Text
  useEffect(() => {
    if (!template) return;
    const textToParse = (template.header_text || '') + ' ' + (template.body_text || '');

    const regex = /\{\{([^}]+)\}\}/g;
    const matches = Array.from(textToParse.matchAll(regex));

    const uniqueVars = Array.from(new Set(matches.map(m => m[1].trim())));
    setDetectedVars(uniqueVars);

    if (uniqueVars.length > 0) {
      const updatedVars = { ...variables };
      let hasChanges = false;
      uniqueVars.forEach(v => {
        if (!updatedVars[v]) {
          updatedVars[v] = { type: 'field', value: 'name' };
          hasChanges = true;
        }
      });
      if (hasChanges) {
        onUpdate(updatedVars);
      }
    }
  }, [template, variables, onUpdate]);

  const handleTypeChange = (varName: string, newType: 'static' | 'field' | 'custom_field') => {
    onUpdate({
      ...variables,
      [varName]: {
        type: newType,
        value: newType === 'static' ? '' : (newType === 'field' ? 'name' : (customFields[0]?.id || ''))
      }
    });
  };

  const handleValueChange = (varName: string, newValue: string) => {
    onUpdate({
      ...variables,
      [varName]: { ...variables[varName], value: newValue }
    });
  };

  // 3. Supabase Image Uploader Logic
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `broadcasts/${fileName}`;

      // Ensure you have a public bucket named 'media' in your Supabase project!
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      // Save the URL to variables so your backend can fetch it as headerMediaUrl
      onUpdate({
        ...variables,
        headerMediaUrl: { type: 'static', value: publicUrl }
      });

      toast.success("Image uploaded successfully!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to upload. Do you have a public bucket named 'media' in Supabase?");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {template.text_variations && template.text_variations.length > 1 && onVariationChange && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <Label className="text-slate-300 font-medium flex items-center gap-2">
            <Variable className="size-4 text-primary" /> Template Variation
          </Label>
          <select
            value={selectedVariationIdx}
            onChange={(e) => onVariationChange(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-primary outline-none"
          >
            {template.text_variations.map((_: any, i: number) => (
              <option key={i} value={i}>Variation {i + 1}</option>
            ))}
          </select>
        </div>
      )}

      {/* NEW: Supabase Image Uploader (Only shows if template requires an image) */}
      {template.header_type === 'image' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ImageIcon className="size-5 text-primary" /> Header Image Required
          </h3>
          <p className="text-sm text-slate-400">
            This template requires an image to send. Upload your property photo or logo here.
          </p>

          <div className="relative group border-2 border-dashed border-slate-700 hover:border-primary/50 rounded-xl p-8 flex flex-col items-center justify-center transition-all bg-slate-950/50">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploadingImage}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
            />

            {uploadingImage ? (
              <div className="flex flex-col items-center text-primary">
                <Loader2 className="size-8 animate-spin mb-3" />
                <span className="text-sm font-medium">Uploading to Supabase...</span>
              </div>
            ) : variables['headerMediaUrl']?.value ? (
              <div className="flex flex-col items-center">
                <div className="relative size-32 mb-3 rounded-lg overflow-hidden border border-slate-800 shadow-md">
                  <img src={variables['headerMediaUrl'].value} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <span className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Image Uploaded & Ready
                </span>
                <span className="text-xs text-slate-500 mt-1">Click or drag a new image to replace</span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-slate-400 group-hover:text-primary transition-colors">
                <UploadCloud className="size-10 mb-3" />
                <span className="text-sm font-medium">Click or drag an image here</span>
                <span className="text-xs mt-1 opacity-70">JPG or PNG</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Template Preview</h3>
        <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50 text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
          {template.header_text && <div className="font-bold mb-2">{template.header_text}</div>}
          {template.body_text}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Variable className="size-5 text-primary" /> Map Variables
          </h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {detectedVars.length} Found
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : detectedVars.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Info className="size-8 mb-2 opacity-50" />
            <p className="text-sm">No variables like {'{{1}}'} or {'{{name}}'} found in this template.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {detectedVars.map(varName => {
              const currentSetting = variables[varName] || { type: 'field', value: 'name' };

              return (
                <div key={varName} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-950/50 p-4 rounded-lg border border-slate-800/80">
                  <div className="md:col-span-3 flex items-center h-10">
                    <span className="bg-primary/20 text-primary font-bold px-3 py-1.5 rounded-md text-sm truncate max-w-full">
                      {`{{${varName}}}`}
                    </span>
                  </div>

                  <div className="md:col-span-3">
                    <select
                      value={currentSetting.type}
                      onChange={(e) => handleTypeChange(varName, e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                    >
                      <optgroup label="CRM Data">
                        <option value="field">Standard Field</option>
                        {customFields.length > 0 && <option value="custom_field">Custom Field</option>}
                      </optgroup>
                      <optgroup label="Manual">
                        <option value="static">Static Text</option>
                      </optgroup>
                    </select>
                  </div>

                  <div className="md:col-span-6">
                    {currentSetting.type === 'static' && (
                      <Input
                        placeholder="Enter text to replace this variable..."
                        value={currentSetting.value}
                        onChange={(e) => handleValueChange(varName, e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white"
                      />
                    )}

                    {currentSetting.type === 'field' && (
                      <select
                        value={currentSetting.value}
                        onChange={(e) => handleValueChange(varName, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="name">Contact Name</option>
                        <option value="phone">Phone Number</option>
                        <option value="email">Email Address</option>
                        <option value="company">Company</option>
                      </select>
                    )}

                    {currentSetting.type === 'custom_field' && (
                      <select
                        value={currentSetting.value}
                        onChange={(e) => handleValueChange(varName, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                      >
                        {customFields.map(cf => (
                          <option key={cf.id} value={cf.id}>{cf.field_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t border-slate-800">
        <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
        <Button onClick={onNext} className="bg-primary hover:bg-primary/90 text-white">
          Continue to Schedule <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}