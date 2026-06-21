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

// FIX 1: Allow TypeScript to accept number and null for 'id'
type MetaSendParameter =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { link?: string; id?: string | number | null } }
  | { type: 'video'; video: { link?: string; id?: string | number | null } }
  | { type: 'document'; document: { link?: string; id?: string | number | null } }
  | { type: 'coupon_code'; coupon_code: string }
  | { type: 'payload'; payload: string };

function buildHeaderComponent(
  template: MessageTemplate,
  params: SendTimeParams,
): MetaSendComponent | null {
  const headerType = template.header_type;
  if (!headerType) return null;

  if (headerType === 'text') {
    const varCount = extractVariableIndices(template.header_content ?? '').length;
    if (varCount === 0) return null;
    const value = params.headerText;
    if (!value || !value.trim()) {
      throw new Error('Header text variable {{1}} requires a value — pass headerText.');
    }
    return {
      type: 'header',
      parameters: [{ type: 'text', text: value }],
    };
  }

  const link = params.headerMediaUrl ?? template.header_media_url;
  const id = params.headerMediaId ?? template.header_handle;

  if (!link && !id) {
    throw new Error(`${headerType} header requires a media link or id at send time.`);
  }

  // FIX 2: Explicitly satisfy the '[integer, null]' Meta schema constraint
  let mediaPayload: any = {};

  if (link && typeof link === 'string' && link.trim() !== '') {
    // If we have a link, force id to 'null'. Meta's schema will see 'null' 
    // and let it pass validation perfectly.
    mediaPayload = { link: link.trim(), id: null };
  } else if (id) {
    // If we only have an ID, we convert the string into a Number to satisfy the 'integer' constraint.
    const numId = Number(id);
    mediaPayload = { id: isNaN(numId) ? id : numId };
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
  const varCount = extractVariableIndices(template.body_text).length;
  const body = params.body ?? [];
  if (varCount === 0 && body.length === 0) return null;
  if (body.length < varCount) {
    throw new Error(`Body has ${varCount} variable(s) but only ${body.length} value(s) were supplied.`);
  }
  const values = body.slice(0, varCount);
  return {
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text: String(text) })),
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