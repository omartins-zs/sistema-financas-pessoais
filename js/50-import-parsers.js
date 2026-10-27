// ============================================
// Importação de extrato bancário (OFX, CSV, QIF)
// ============================================

// Valor com sinal: aceita "1.234,56", "-1234.56", "(123,45)" e "123,45-"
const parseSignedValue = (raw) => {
  let s = String(raw ?? '').trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');       // BR: 1.234,56
  else if (lastComma > -1) s = s.replace(/,/g, '');                          // US: 1,234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');          // 1.234 = milhar BR

  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
};

// Datas de banco: DD/MM/YYYY, YYYY-MM-DD, DD/MM/YY e YYYYMMDD (OFX)
const parseBankDate = (raw) => {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) m = [m[0], m[3], m[2], m[1]];
  }
  if (!m) {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
    if (m) m = [m[0], `20${m[3]}`, m[2], m[1]];
  }
  if (!m) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20260815120000[-3:BRT]
    if (m && +m[2] >= 1 && +m[2] <= 12) m = [m[0], m[1], m[2], m[3]];
    else m = null;
  }
  if (!m) return null;

  const [, y, mo, d] = m;
  const month = String(mo).padStart(2, '0');
  const day = String(d).padStart(2, '0');
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || +y < 1990 || +y > 2100) return null;
  return `${y}-${month}-${day}`;
};

// Nome limpo para o que o banco manda embolado: "SHOPEE *VENDEDORX",
// "MERCADOLIVRE*LOJAY", "MP *FULANO", "EBN*SPOTIFY", "IFD*RESTAURANTE"...
const BANK_MERCHANTS = [
  // [regex, marca, usa o resto como vendedor?]
  [/(?:^|\W)shopee\s*\*?\s*(.*)/i, 'Shopee', true],
  [/(?:^|\W)(?:mercadolivre|mercado\s*livre|meli)\s*\*?\s*(.*)/i, 'Mercado Livre', true],
  [/(?:^|\W)(?:mercadopago|mercado\s*pago|\bmp)\s*\*\s*(.*)/i, 'Mercado Pago', true],
  [/(?:^|\W)(?:pg|pag)\s*\*\s*(.*)/i, 'PagSeguro', true],
  [/(?:^|\W)paypal\s*\*\s*(.*)/i, 'PayPal', true],
  [/(?:^|\W)(?:ifd|ifood)\s*\*?\s*(.*)/i, 'iFood', true],
  [/(?:^|\W)(?:amazon|amzn)(?:\.com\.?(?:br)?)?\s*\*?\s*(.*)/i, 'Amazon', true],
  [/(?:^|\W)aliexpress/i, 'AliExpress', false],
  [/(?:^|\W)spotify/i, 'Spotify', false],
  [/(?:^|\W)netflix/i, 'Netflix', false],
  [/(?:^|\W)uber\s*(?:\*\s*)?eats/i, 'Uber Eats', false],
  [/(?:^|\W)uber\b/i, 'Uber', false],
  [/(?:^|\W)99\s*(?:app|pop|\*)/i, '99', false],
  [/(?:^|\W)rappi/i, 'Rappi', false],
  [/(?:^|\W)apple\.com\/bill|(?:^|\W)apple\s*\*/i, 'Apple', false],
  [/(?:^|\W)(?:dl\s*\*\s*)?google\s*\*?\s*(.*)/i, 'Google', true],
  [/(?:^|\W)steam(?:games|\s|\*|$)/i, 'Steam', false],
  [/(?:^|\W)playstation|(?:^|\W)sony\s*\*/i, 'PlayStation', false],
  [/(?:^|\W)(?:americanas|b2w)/i, 'Americanas', false],
  [/(?:^|\W)(?:magalu|magazine\s*luiza)/i, 'Magalu', false],
  [/(?:^|\W)shein/i, 'Shein', false],
  [/(?:^|\W)airbnb/i, 'Airbnb', false]
];

const normalizeBankDesc = (raw) => {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Extrato Nubank: "Transferência enviada pelo Pix - NOME - •••.123.456-•• - BANCO"
  let m = s.match(/^transfer[êe]ncia (enviada|recebida)(?: pelo pix)? -\s*([^-]+?)\s*(?:-|$)/i);
  if (m) {
    const via = /pelo pix/i.test(s) ? 'Pix' : 'Transferência';
    const dir = m[1].toLowerCase() === 'enviada' ? 'enviado' : 'recebido';
    const nome = titleCaseDesc(m[2].trim());
    return via === 'Pix' ? `Pix ${dir} · ${nome}` : `Transferência (${dir}) · ${nome}`;
  }
  m = s.match(/^pagamento de boleto(?: efetuado)?\s*-?\s*(.*)/i);
  if (m) return m[1].trim() ? `Boleto · ${titleCaseDesc(m[1].trim())}` : 'Pagamento de boleto';
  if (/^pagamento de fatura/i.test(s)) return 'Pagamento de fatura';
  if (/^aplica[çc][ãa]o rdb/i.test(s)) return 'Aplicação RDB';
  if (/^resgate rdb/i.test(s)) return 'Resgate RDB';

  // Remove prefixos de operação que só poluem
  s = s.replace(/^(compra\s+(?:no\s+)?(?:cartao|cartão|debito|débito|credito|crédito)(?:\s+a\s+vista)?|compra\s+com\s+cart[aã]o)\s*[-:]?\s*/i, '');

  // Anotação do dono feita no app do banco — "Uber(Carro Mecânica)" — volta no final
  const nota = s.match(/\(([^()]{3,})\)\s*$/);
  if (nota) s = s.slice(0, nota.index).trim();

  // Parcela ("- Parcela 3/12", "PARC 03/10", "3/12") vira sufixo padronizado
  const parcela = s.match(/(?:-\s*)?(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
  if (parcela) s = s.slice(0, parcela.index).replace(/[\s-]+$/, '');

  // Sujeira comum: máscara de cartão ("*0000"), código de loja no fim, underscores
  s = s.replace(/\*+\d+(?=\s|$)/g, '').replace(/[-\s]+\d{3,}$/, '').replace(/_/g, ' ')
    .replace(/\s+/g, ' ').trim();

  let nome = '';
  for (const [re, marca, comVendedor] of BANK_MERCHANTS) {
    const bm = s.match(re);
    if (!bm) continue;
    let vendedor = '';
    if (comVendedor && bm[1]) {
      vendedor = bm[1].replace(/[*_#-]+/g, ' ').replace(/\s+/g, ' ').trim();
      // descarta restos sem informação (códigos, "br", número do pedido)
      if (/^\d+$/.test(vendedor) || vendedor.length < 3 || /^brasil$|^br$/i.test(vendedor)) vendedor = '';
    }
    nome = vendedor ? `${marca} · ${titleCaseDesc(vendedor)}` : marca;
    break;
  }

  if (!nome) nome = (s === s.toUpperCase() && s.length > 3) ? titleCaseDesc(s) : s;

  if (parcela) nome += ` ${+parcela[1]}/${+parcela[2]}`;
  if (nota) nome += ` (${nota[1].trim()})`;
  return nome;
};

const titleCaseDesc = (s) => String(s).toLowerCase().replace(/(^|\s|\.)([a-zà-ú])/g, (_, sep, ch) => sep + ch.toUpperCase());

// Categoria sugerida pela descrição (só usa categorias que já existem no app)
const BANK_CATEGORY_HINTS = [
  [/mercado|supermerc|atacad|carrefour|assai|assaí|extra\b|pao de acucar|hortifruti|sacolao|sacolão/i, 'Mercado'],
  [/posto|combust|ipiranga|shell|petrobras|br mania|gasolina|etanol/i, 'Combustível'],
  [/farmac|farmác|drogaria|drogasil|pacheco|raia|panvel|remedio|remédio/i, 'Farmácia'],
  [/energia|\bluz\b|cemig|copel|enel|cpfl|light|celesc|coelba/i, 'Luz'],
  [/\bagua\b|\bágua\b|saneamento|sabesp|copasa|sanepar|embasa/i, 'Água'],
  [/internet|vivo\b|claro\b|tim\b|\boi\b|net\b.*virtua|fibra/i, 'Internet'],
  [/aluguel|imobiliaria|imobiliária/i, 'Aluguel'],
  [/cdb|rdb|tesouro|lci\b|lca\b|aplicacao|aplicação|poupanca|poupança|invest/i, 'Investimentos']
];

const guessBankCategory = (desc) => {
  for (const [re, cat] of BANK_CATEGORY_HINTS) {
    if (re.test(desc)) {
      const nome = cat === 'Investimentos' ? catPapel('investimentos') : cat;
      return CATEGORIAS.includes(nome) ? nome : catPapel('outros');
    }
  }
  return catPapel('outros');
};

// Linhas de saldo do extrato não são transações
const isBalanceLine = (desc) =>
  /^s\s*a\s*l\s*d\s*o(\s|$)|saldo\s+(do\s+dia|anterior|final|em\s+conta|disponivel|disponível)|^saldo$/i.test(String(desc).trim());

// OFX costuma vir em latin-1; decodifica UTF-8 e cai para latin-1 se aparecer U+FFFD
const readBankFileText = async (file) => {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
};

const parseOFX = (text) => {
  const txs = [];
  text.split(/<STMTTRN>/i).slice(1).forEach((block) => {
    const chunk = block.split(/<\/STMTTRN>/i)[0];
    const tag = (name) => {
      const m = chunk.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const date = parseBankDate(tag('DTPOSTED'));
    const amount = parseSignedValue(tag('TRNAMT'));
    const desc = tag('MEMO') || tag('NAME') || tag('PAYEE');
    const fitid = tag('FITID');
    const trntype = tag('TRNTYPE').toUpperCase();
    if (date && amount !== 0 && desc) txs.push({ date, amount, desc, fitid, ...(trntype ? { trntype } : {}) });
  });
  return txs;
};

const parseQIF = (text) => {
  const txs = [];
  let cur = {};
  text.split(/\r?\n/).forEach((line) => {
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === 'D') cur.date = parseBankDate(val);
    else if (code === 'T' || code === 'U') cur.amount = parseSignedValue(val);
    else if (code === 'P' || code === 'M') cur.desc = cur.desc || val;
    else if (code === '^') {
      if (cur.date && cur.amount && cur.desc) txs.push(cur);
      cur = {};
    }
  });
  return txs;
};

// CSV com células entre aspas (Nubank usa vírgula dentro da descrição)
const parseCsvLineQuoted = (line, sep) => {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
};

const parseBankCSV = (text) => {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { txs: [], hint: null };

  // separador: o que aparecer mais fora de aspas na primeira linha útil
  const conta = (l, ch) => l.replace(/"[^"]*"/g, '').split(ch).length;
  const sep = conta(lines[0], ';') >= conta(lines[0], ',') ? ';' : ',';
  const rows = lines.map((l) => parseCsvLineQuoted(l, sep));

  // Cabeçalho: primeira linha cujo texto casa com nomes conhecidos
  const isHeader = (cells) => cells.some((c) => /^(data|date|dia)/i.test(normalizeHeader(c)))
    && cells.some((c) => /desc|titulo|title|historico|lancamento|memo|estabelecimento/.test(normalizeHeader(c)));

  let dateCol = -1; let descCol = -1; let valueCol = -1; let idCol = -1; let start = 0;
  let hint = null; // 'conta' | 'cartao', quando o cabeçalho identifica o arquivo

  if (isHeader(rows[0])) {
    const headers = rows[0].map(normalizeHeader);
    dateCol = headers.findIndex((h) => /^(data|date|dia)/.test(h));
    descCol = headers.findIndex((h) => /desc|titulo|title|historico|lancamento|memo|estabelecimento/.test(h));
    valueCol = headers.findIndex((h) => /^(valor|amount|value|quantia)/.test(h));
    idCol = headers.findIndex((h) => /^identificador|^identifier|^id$/.test(h)); // Nubank: UUID por transação

    // Assinaturas do Nubank: fatura = date,title,amount · extrato tem Identificador
    if (headers.includes('date') && headers.includes('title') && headers.includes('amount')) hint = 'cartao';
    else if (idCol >= 0) hint = 'conta';
    start = 1;
  } else {
    // Sem cabeçalho (Itaú): infere pelas primeiras linhas de dados
    const amostra = rows[0];
    dateCol = amostra.findIndex((c) => parseBankDate(c));
    const numericas = amostra.map((c, i) => (i !== dateCol && c && parseSignedValue(c) !== 0 && /\d/.test(c) && !/[a-z]{3,}/i.test(c) ? i : -1)).filter((i) => i >= 0);
    valueCol = numericas.length ? numericas[0] : -1;
    descCol = amostra.findIndex((c, i) => i !== dateCol && i !== valueCol && /[a-z]{3,}/i.test(c));
  }

  if (dateCol < 0 || valueCol < 0 || descCol < 0) return { txs: [], hint: null };

  const txs = [];
  rows.slice(start).forEach((cells) => {
    const date = parseBankDate(cells[dateCol]);
    const amount = parseSignedValue(cells[valueCol]);
    const desc = String(cells[descCol] ?? '').trim();
    if (!date || amount === 0 || !desc || isBalanceLine(desc)) return;
    const tx = { date, amount, desc };
    const fitid = idCol >= 0 ? String(cells[idCol] ?? '').trim() : '';
    if (fitid) tx.fitid = fitid;
    txs.push(tx);
  });
  return { txs, hint };
};

const parseBankFile = async (file) => {
  const text = await readBankFileText(file);
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'ofx' || /<OFX>|<STMTTRN>/i.test(text)) {
    // OFX de cartão de crédito usa <CCSTMTRS>/<CREDITCARDMSGSRSV1>
    const hint = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text) ? 'cartao' : 'conta';
    const dtend = (text.match(/<DTEND>(\d{6})/i) || [])[1];
    const org = (text.match(/<ORG>([^<\r\n]+)/i) || [])[1] || '';
    return { txs: parseOFX(text), formato: 'OFX', hint, fim: dtend ? `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}` : null, org };
  }
  if (ext === 'qif' || /^!Type:/im.test(text)) {
    const hint = /^!Type:CCard/im.test(text) ? 'cartao' : 'conta';
    return { txs: parseQIF(text), formato: 'QIF', hint };
  }
  const { txs, hint } = parseBankCSV(text);
  return { txs, formato: 'CSV', hint };
};

// Fatura: de que lado está o gasto? OFX marca TRNTYPE (CREDIT = pagamento/estorno);
// sem TRNTYPE (CSV/QIF), o gasto é o sinal majoritário do arquivo — no CSV de fatura
// do Nubank o gasto é positivo, no OFX é negativo.
const makeCardExpenseTest = (txs) => {
  const negativas = txs.filter((t) => t.amount < 0).length;
  const sinalGasto = negativas > txs.length - negativas ? -1 : 1;
  return (t) => (t.trntype ? !/CREDIT/.test(t.trntype) : (t.amount < 0 ? -1 : 1) === sinalGasto);
};

const bankIssuerName = (org, fileName) => {
  const fonte = `${org || ''} ${fileName || ''}`;
  if (/nu\s*pagamentos|nubank/i.test(fonte)) return 'Nubank';
  if (org) return titleCaseDesc(org.toLowerCase().replace(/\s+s\.?a\.?$/i, '').trim());
  return 'Cartão';
};
