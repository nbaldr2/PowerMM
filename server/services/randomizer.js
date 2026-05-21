import crypto from 'crypto';

/**
 * Content Randomizer Pipeline
 * Mutates HTML structure, text, and content to defeat hash/fingerprint matching.
 */

// Homoglyph character map (Latin → Cyrillic/Greek lookalikes)
const HOMOGLYPHS = {
  'a': '\u0430', 'e': '\u0435', 'o': '\u043E', 'p': '\u0440',
  'c': '\u0441', 'x': '\u0445', 'y': '\u0443', 'i': '\u0456',
  'A': '\u0410', 'B': '\u0412', 'E': '\u0415', 'K': '\u041A',
  'M': '\u041C', 'H': '\u041D', 'O': '\u041E', 'P': '\u0420',
  'C': '\u0421', 'T': '\u0422', 'X': '\u0425',
};

// Ham words for poison blocks
const HAM_WORDS = [
  'weather forecast today', 'recipe ingredients cooking', 'family vacation photos',
  'garden tips seasonal', 'book review recommendation', 'local community events',
  'healthy lifestyle wellness', 'technology innovation update', 'sports results weekend',
  'music playlist favorites', 'home improvement ideas', 'pet care veterinary tips',
];

// ============================================================
// STRUCTURE
// ============================================================
export function renameClassId(html) {
  return html
    .replace(/class="([^"]*)"/gi, () => `class="r${crypto.randomBytes(4).toString('hex')}"`)
    .replace(/id="([^"]*)"/gi, () => `id="x${crypto.randomBytes(4).toString('hex')}"`);
}

export function swapTags(html) {
  const swaps = [
    [/<b>/gi, '<strong>'], [/<\/b>/gi, '</strong>'],
    [/<i>/gi, '<em>'], [/<\/i>/gi, '</em>'],
  ];
  let r = html;
  for (const [from, to] of swaps) {
    if (Math.random() > 0.5) r = r.replace(from, to);
  }
  return r;
}

export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

export function addLinkParams(html) {
  return html.replace(/href="(https?:\/\/[^"]*)"/gi, (m, url) => {
    const sep = url.includes('?') ? '&' : '?';
    return `href="${url}${sep}utm_id=${crypto.randomBytes(3).toString('hex')}&t=${Date.now()}"`;
  });
}

export function addImageParams(html) {
  return html.replace(/src="(https?:\/\/[^"]*\.(png|jpg|gif|webp)[^"]*)"/gi, (m, url) => {
    const sep = url.includes('?') ? '&' : '?';
    return `src="${url}${sep}cb=${crypto.randomBytes(3).toString('hex')}"`;
  });
}

// ============================================================
// TEXT
// ============================================================
export function textMutation(html) {
  // Insert zero-width spaces at random positions in text nodes
  return html.replace(/>([^<]{10,})</g, (match, text) => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += text[i];
      if (Math.random() < 0.05 && text[i] !== ' ') {
        result += '\u200B'; // zero-width space
      }
    }
    return `>${result}<`;
  });
}

export function splitWords(html) {
  return html.replace(/>([^<]{5,})</g, (match, text) => {
    const words = text.split(' ');
    const result = words.map(w => {
      if (w.length > 4 && Math.random() < 0.3) {
        const mid = Math.floor(w.length / 2);
        return `<span style="display:inline">${w.slice(0, mid)}</span><span style="display:inline">${w.slice(mid)}</span>`;
      }
      return w;
    }).join(' ');
    return `>${result}<`;
  });
}

export function wrapSpan(html) {
  return html.replace(/>([^<]{8,})</g, (match, text) => {
    if (Math.random() < 0.4) {
      return `><span style="display:inline">${text}</span><`;
    }
    return match;
  });
}

// ============================================================
// ANTI-BAYES
// ============================================================
export function applyHomoglyphs(html, percentage = 30) {
  if (percentage <= 0) return html;
  const rate = percentage / 100;

  return html.replace(/>([^<]+)</g, (match, text) => {
    let result = '';
    for (const char of text) {
      if (HOMOGLYPHS[char] && Math.random() < rate) {
        result += HOMOGLYPHS[char];
      } else {
        result += char;
      }
    }
    return `>${result}<`;
  });
}

export function injectWhitespace(html) {
  const ws = ['\u200B', '\u200C', '\u200D', '\uFEFF']; // zero-width chars
  return html.replace(/>([^<]{10,})</g, (match, text) => {
    let result = '';
    for (const char of text) {
      result += char;
      if (Math.random() < 0.03) {
        result += ws[Math.floor(Math.random() * ws.length)];
      }
    }
    return `>${result}<`;
  });
}

export function hamPoison(html, blocks = 5) {
  let poison = '';
  for (let i = 0; i < blocks; i++) {
    const words = HAM_WORDS[Math.floor(Math.random() * HAM_WORDS.length)];
    poison += `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:0;color:transparent;">${words}</div>`;
  }
  return html.replace(/<\/body>/i, `${poison}</body>`);
}

export function replaceWithEntities(html) {
  return html.replace(/>([^<]+)</g, (match, text) => {
    let result = '';
    for (const char of text) {
      if (Math.random() < 0.08 && char.match(/[a-zA-Z]/)) {
        result += `&#${char.charCodeAt(0)};`;
      } else {
        result += char;
      }
    }
    return `>${result}<`;
  });
}

export function injectHiddenText(html) {
  const sentences = [
    'This message was formatted for optimal reading experience.',
    'Content delivery optimized for your email client.',
    'Automated message delivery system notification.',
  ];
  const s = sentences[Math.floor(Math.random() * sentences.length)];
  const div = `<div style="display:none;width:0;height:0;overflow:hidden;position:absolute;">${s}</div>`;
  return html.replace(/<body([^>]*)>/i, `<body$1>${div}`);
}

// ============================================================
// ANTI-HASH
// ============================================================
export function injectDirectionMarks(html) {
  return html.replace(/>([^<]{10,})</g, (match, text) => {
    let result = '';
    for (const char of text) {
      result += char;
      if (Math.random() < 0.02) result += '\u200E'; // LTR mark
    }
    return `>${result}<`;
  });
}

export function injectDataAttributes(html) {
  return html.replace(/<(div|span|td|p|table)(\s)/gi, (m, tag, sp) => {
    return `<${tag} data-x="${crypto.randomBytes(3).toString('hex')}"${sp}`;
  });
}

export function classMutate(html) {
  return html.replace(/class="([^"]*)"/gi, (m, cls) => {
    return `class="${cls} m${crypto.randomBytes(2).toString('hex')}"`;
  });
}

export function injectSoftHyphens(html) {
  return html.replace(/>([^<]{8,})</g, (match, text) => {
    const words = text.split(' ');
    const result = words.map(w => {
      if (w.length > 5 && Math.random() < 0.3) {
        const mid = Math.floor(w.length / 2);
        return w.slice(0, mid) + '\u00AD' + w.slice(mid);
      }
      return w;
    }).join(' ');
    return `>${result}<`;
  });
}

export function fontWrap(html) {
  return html.replace(/>([^<]{5,})</g, (match, text) => {
    if (Math.random() < 0.25) {
      return `><font style="font-size:inherit;font-family:inherit;color:inherit;">${text}</font><`;
    }
    return match;
  });
}

// ============================================================
// MAIN PIPELINE
// ============================================================
export function applyContentRandomizer(html, settings = {}) {
  if (!html) return html;

  // Structure
  if (settings.renameClassId) html = renameClassId(html);
  if (settings.swapTags) html = swapTags(html);
  if (settings.stripComments) html = stripComments(html);
  if (settings.linkParams) html = addLinkParams(html);
  if (settings.imageParams) html = addImageParams(html);

  // Text
  if (settings.textMutation) html = textMutation(html);
  if (settings.splitWords) html = splitWords(html);
  if (settings.wrapSpan) html = wrapSpan(html);

  // Anti-Bayes
  if (settings.homoglyphs) html = applyHomoglyphs(html, settings.homoglyphPct || 30);
  if (settings.whitespace) html = injectWhitespace(html);
  if (settings.hamPoison) html = hamPoison(html, settings.poisonBlocks || 5);
  if (settings.entities) html = replaceWithEntities(html);
  if (settings.hiddenText) html = injectHiddenText(html);

  // Anti-Hash
  if (settings.directionMarks) html = injectDirectionMarks(html);
  if (settings.attrInject) html = injectDataAttributes(html);
  if (settings.classMutate) html = classMutate(html);
  if (settings.softHyphens) html = injectSoftHyphens(html);
  if (settings.fontWrap) html = fontWrap(html);

  return html;
}
