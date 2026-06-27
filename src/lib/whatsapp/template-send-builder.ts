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

  return {
    type: 'body',
    // 🔥 FIX: Map over sortedVars to GUARANTEE we send the exact number of parameters Meta expects
    parameters: sortedVars.map((paramName, i) => {
      const textVal = body[i];

      // Prevent "undefined" or "null" strings, and provide a safe fallback space
      let safeText = ' '; // Fallback prevents Meta 131009 crash

      if (textVal !== undefined && textVal !== null && String(textVal).trim() !== '') {
        safeText = String(textVal);
      }

      const result: MetaSendParameter = { type: 'text', text: safeText };

      // 🔥 THE SKELETON KEY 🔥
      // If the variable is named (e.g. {{name}} instead of {{1}}), Meta strictly demands parameter_name.
      if (paramName && !/^\d+$/.test(paramName)) {
        result.parameter_name = paramName;
      }

      return result;
    }),
  };
}