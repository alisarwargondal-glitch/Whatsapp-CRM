import type { MessageTemplate, TemplateButton } from '@/types';
import { extractVariableIndices } from './template-validators';

export interface SendTimeParams {
  body?: string[];
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaId?: string;
  buttonParams?: Record<number, string>;
}

export type MetaSendComponent =
  | { type: 'header'; parameters: MetaSendParameter[] }
  | { type: 'body'; parameters: MetaSendParameter[] }
  | {
    type: 'button';
    sub_type: 'url' | 'quick_reply' | 'copy_code';
    index: string;
    parameters: MetaSendParameter[];
  };

// 🔥 THE FIX: Added 'parameter_name' to the strict TypeScript schema
type MetaSendParameter =
  | { type: 'text'; text: string; parameter_name?: string }
  | { type: 'image'; image: { link?: string; id?: number } }
  | { type: 'video'; video: { link?: string; id?: number } }
  | { type: 'document'; document: { link?: string; id?: number } }
  | { type: 'coupon_code'; coupon_code: string }
  | { type: 'payload'; payload: string };

function buildHeaderComponent(
  template: MessageTemplate,
  params: SendTimeParams,
): MetaSendComponent | null {
  if (!template.header_type || template.header_type === 'none') return null;

  const headerType = template.header_type.toLowerCase();

  if (headerType === 'text') {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = Array.from((template.header_content || '').matchAll(regex));
    const uniqueVars = Array.from(new Set(matches.map(m => m[1].trim())));

    if (uniqueVars.length === 0) return null;

    const value = params.headerText;
    if (!value || !value.trim()) {
      throw new Error('Header text variable requires a value — pass headerText.');
    }

    const paramName = uniqueVars[0];
    const isNumeric = /^\d+$/.test(paramName);

    const textParam: MetaSendParameter = { type: 'text', text: value };

    // 🔥 If the header uses a named variable, pass the name!
    if (!isNumeric) {
      textParam.parameter_name = paramName;
    }

    return {
      type: 'header',
      parameters: [textParam],
    };
  }

  const link = params.headerMediaUrl || template.header_media_url;
  const idOrUrl = params.headerMediaId || template.header_handle;

  let mediaPayload: any = null;

  if (typeof link === 'string' && link.includes('http')) {
    mediaPayload = { link: link.trim() };
  }
  else if (typeof idOrUrl === 'string' && idOrUrl.includes('http')) {
    mediaPayload = { link: idOrUrl.trim() };
  }
  else if (idOrUrl && /^\d+$/.test(String(idOrUrl).trim())) {
    mediaPayload = { id: parseInt(String(idOrUrl).trim(), 10) };
  }

  if (!mediaPayload) {
    throw new Error(`Meta API Rule: You must provide a valid Image URL or a freshly uploaded Media ID to send this broadcast.`);
  }

  return {
    type: 'header',
    parameters: [
      headerType === 'image'
        ? { type: 'image', image: mediaPayload }
        : headerType === 'video'
          ? { type: 'video', video: mediaPayload }
          : { type: 'document', document: mediaPayload },
    ],
  };
}

function buildBodyComponent(
  template: MessageTemplate,
  params: SendTimeParams,
): MetaSendComponent | null {
  const bodyText = template.body_text || '';

  // Extract all variables (e.g., {{name}}, {{1}}) directly from the text
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = Array.from(bodyText.matchAll(regex));
  const uniqueVars = Array.from(new Set(matches.map(m => m[1].trim())));

  // Sort them so they perfectly match the order of the params coming from your backend
  const sortedVars = uniqueVars.sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  const body = params.body ?? [];
  if (sortedVars.length === 0) return null;

  const values = body.slice(0, sortedVars.length);

  return {
    type: 'body',
    parameters: values.map((textVal, i) => {
      // Ensure we NEVER send a blank string to Meta, which also causes #100 crashes
      const textStr = String(textVal).trim() === '' ? ' ' : String(textVal);
      const paramName = sortedVars[i];

      const result: MetaSendParameter = { type: 'text', text: textStr };

      // 🔥 THE SKELETON KEY 🔥
      // If the variable is named (e.g. {{name}} instead of {{1}}), Meta strictly demands parameter_name.
      if (paramName && !/^\d+$/.test(paramName)) {
        result.parameter_name = paramName;
      }

      return result;
    }),
  };
}

function buttonNeedsSendParam(button: TemplateButton, override: string | undefined): boolean {
  switch (button.type) {
    case 'URL':
      return extractVariableIndices(button.url).length > 0;
    case 'COPY_CODE':
      return true;
    case 'QUICK_REPLY':
    case 'PHONE_NUMBER':
      return override !== undefined;
    default:
      return false;
  }
}

function buildButtonComponent(
  button: TemplateButton,
  index: number,
  override: string | undefined,
): MetaSendComponent | null {
  if (!buttonNeedsSendParam(button, override)) return null;

  switch (button.type) {
    case 'URL':
      if (!override || !override.trim()) throw new Error(`URL button #${index + 1} requires a value.`);
      return {
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: override }],
      };
    case 'COPY_CODE':
      return {
        type: 'button',
        sub_type: 'copy_code',
        index: String(index),
        parameters: [{ type: 'coupon_code', coupon_code: override?.trim() || button.example || 'CODE' }],
      };
    case 'QUICK_REPLY':
      return {
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [{ type: 'payload', payload: override || 'PAYLOAD' }],
      };
    default:
      return null;
  }
}

export function buildSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];
  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);
  const body = buildBodyComponent(template, params);
  if (body) out.push(body);
  if (template.buttons?.length) {
    template.buttons.forEach((btn, i) => {
      const override = params.buttonParams?.[i];
      const component = buildButtonComponent(btn, i, override);
      if (component) out.push(component);
    });
  }
  return out;
}