// P1-1 evidence: run the GFM autolink spec examples through markdown-it + linkify-it.
// Used by docs/rewrite/phase-1/decisions.md (P1-1).
//
//   yarn autolink            # summary per configuration
//   yarn autolink:detail     # also print every failing case for the wrapper config
//
// Uses the pinned GFM spec files vendored in test/fixtures/gfm (cmark-gfm 0.29.0.gfm.13).
//
// Configurations:
//   1. markdown-it default linkify   (fuzzyLink: false)
//   2. fuzzyLink + fuzzyEmail on
//   3. (2) + thin filter: keep only matches with a scheme, www. or an email
//   4. linkify-it + thin wrapper: (3) + xmpp: schema, GFM rejects (+ in email domain,
//      _ in host) and GFM trimming (trailing punctuation, unbalanced ')', trailing entity)

const fs = require('fs'); const path = require('path');
const MarkdownIt = require('markdown-it');
const dir = path.join(__dirname, '..', 'test', 'fixtures', 'gfm');

function examples(file, startHeading) {
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
  const out = []; let section = null, inEx = false, md = [], html = [], part = 0, ln = 0;
  for (const [i, l] of lines.entries()) {
    if (!inEx && /^#{1,6} /.test(l)) section = l.replace(/^#+ /, '');
    if (l.startsWith('````````````````````````````````') && l.includes('example')) { inEx = true; md = []; html = []; part = 0; ln = i + 1; continue; }
    if (inEx && l.startsWith('````````````````````````````````')) { inEx = false;
      if (section === startHeading) out.push({ file, line: ln, md: md.join('\n').replace(/→/g, '\t') + '\n', html: html.join('\n') + (html.length ? '\n' : '') }); continue; }
    if (inEx) { if (l === '.' && part === 0) { part = 1; continue; } (part ? html : md).push(l); }
  }
  return out;
}
const all = [...examples('spec.txt', 'Autolinks (extension)'), ...examples('extensions.txt', 'Autolinks')];

// normalization in the spirit of the spec's normalize.py (whitespace between tags, <img … /> == <img …>)
const norm = (h) => h.replace(/\n/g, '').replace(/>\s+</g, '><').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/ \/>/g, '>').trim();

// GFM rule for "valid domain" start: a match must have a scheme (http/https/ftp? per GFM: http:// https://), "www.", or be an email.
function filterPlugin(md) {
  md.core.ruler.after('linkify', 'gfm_autolink_filter', (state) => {
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      const ch = blk.children; const out = [];
      for (let i = 0; i < ch.length; i++) {
        const t = ch[i];
        if (t.type === 'link_open' && t.markup === 'linkify') {
          const text = ch[i + 1]?.content ?? '';
          const ok = /^(https?:\/\/|www\.)/i.test(text) || /^[\w.+-]+@/.test(text) || /^(mailto|xmpp):/i.test(text);
          if (!ok) { out.push(ch[i + 1]); i += 2; continue; } // unwrap: keep text, drop open/close
        }
        out.push(t);
      }
      blk.children = out;
    }
  });
}

const PREFIX=/^(https?:\/\/|ftp:\/\/|www\.|mailto:|xmpp:)/i, EMAIL=/^[\w.+-]+@/;
function gfmWrapper(md){
  md.linkify.set({fuzzyLink:true,fuzzyEmail:true,fuzzyIP:false});
  // config: xmpp: schema (GFM extended protocol autolink), resource part allowed
  md.linkify.add('xmpp:',{validate:(text,pos)=>{const m=text.slice(pos).match(/^[\w.+-]+@[\w-]+(\.[\w-]+)+(\/[\w.@-]*[\w@-])?/);return m?m[0].length:0;}});
  md.core.ruler.after('linkify','gfm_autolink',(state)=>{
    for(const blk of state.tokens){ if(blk.type!=='inline'||!blk.children) continue;
      const ch=blk.children, out=[];
      for(let i=0;i<ch.length;i++){ const t=ch[i];
        if(!(t.type==='link_open'&&t.markup==='linkify')){out.push(t);continue;}
        const txt=ch[i+1], close=ch[i+2], next=ch[i+3]; let s=txt.content;
        const unwrap=()=>{out.push(txt); i+=2;};
        // filter: GFM needs a scheme, www. or an email
        if(!PREFIX.test(s)&&!EMAIL.test(s)){unwrap();continue;}
        // reject: '+' in email domain; '_' in last two labels of a www/url host
        if(/@[^@]*\+/.test(s.replace(/^(mailto|xmpp):/i,''))){unwrap();continue;}
        if(next&&next.type==='text'&&/^\.?[\w-]*_/.test(next.content)&&/^www\./i.test(s)){unwrap();continue;}
        // trim: trailing punctuation, unbalanced ')' and a trailing entity reference
        let tail='';
        for(;;){ const m=s.match(/[?!.,:*_~]$/); if(m){tail=m[0]+tail;s=s.slice(0,-1);continue;}
          if(s.endsWith(')')&&(s.split('(').length<s.split(')').length)){tail=')'+tail;s=s.slice(0,-1);continue;}
          break; }
        if(next&&next.type==='text'&&next.content.startsWith(';')){const m=s.match(/&[a-z0-9]+$/i); if(m){tail=m[0]+tail; s=s.slice(0,-m[0].length);}}
        if(tail){ const href=t.attrGet('href'); t.attrSet('href',href.slice(0,href.length-(txt.content.length-s.length)).replace(/&amp;/g,'&'));
          txt.content=s; out.push(t,txt,close); const tt=new state.Token('text','',0); tt.content=tail; out.push(tt); i+=2; continue; }
        out.push(t);
      }
      // merge adjacent text tokens (cosmetic)
      blk.children=out;
    }
  });
}

const configs = {
  '1 default linkify': () => MarkdownIt({ linkify: true }),
  '2 fuzzy on': () => { const m = MarkdownIt({ linkify: true }); m.linkify.set({ fuzzyLink: true, fuzzyEmail: true, fuzzyIP: false }); return m; },
  '3 fuzzy + filter': () => { const m = MarkdownIt({ linkify: true }).use(filterPlugin); m.linkify.set({ fuzzyLink: true, fuzzyEmail: true, fuzzyIP: false }); return m; },
  '4 linkify-it + wrapper': () => MarkdownIt({ linkify: true }).use(gfmWrapper),
};

const detail = process.argv.includes('--detail');
console.log(`GFM autolink examples: ${all.length} (spec.txt ${all.filter(e => e.file === 'spec.txt').length}, extensions.txt ${all.filter(e => e.file !== 'spec.txt').length})`);
for (const [name, mk] of Object.entries(configs)) {
  const md = mk(); let pass = 0, paras = 0, parasOk = 0; const fails = [];
  for (const ex of all) {
    if (ex.html.trim() === '<IGNORE>') { md.render(ex.md); pass++; continue; }   // crash test only
    const got = norm(md.render(ex.md)), want = norm(ex.html);
    if (got === want) pass++; else fails.push({ ex, got, want });
    // per-paragraph count (extensions.txt bundles many cases into one example)
    const p = ex.md.split('\n\n'), g = got.split('</p><p>'), w = want.split('</p><p>');
    paras += p.length; p.forEach((_, i) => { if ((g[i] || '').replace(/^<p>|<\/p>$/g, '') === (w[i] || '').replace(/^<p>|<\/p>$/g, '')) parasOk++; });
  }
  console.log(`${name.padEnd(26)} examples ${pass}/${all.length}   cases (paragraphs) ${parasOk}/${paras}`);
  if (detail && name.startsWith('4')) for (const f of fails) {
    const p = f.ex.md.split('\n\n'), g = f.got.split('</p><p>'), w = f.want.split('</p><p>');
    p.forEach((s, i) => { const gi = (g[i] || '').replace(/^<p>|<\/p>$/g, ''), wi = (w[i] || '').replace(/^<p>|<\/p>$/g, '');
      if (gi !== wi) console.log(`  ${f.ex.file}:${f.ex.line} ${JSON.stringify(s.trim())}\n    want ${wi}\n    got  ${gi}`); });
  }
}
const md4 = configs['4 linkify-it + wrapper']();
console.log('\nfalse-positive check (must not link):', ['README.md', 'file.js', 'example.com'].map(s => `${s} → ${/<a /.test(md4.renderInline(s)) ? 'LINKED' : 'text'}`).join(', '));
