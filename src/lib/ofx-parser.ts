/**
 * Simple OFX/OFC parser for Brazilian bank statements.
 * Extracts STMTTRN (statement transactions) from OFX text.
 */

export interface OFXTransaction {
  id: string;           // FITID
  type: 'DEBIT' | 'CREDIT' | 'OTHER';
  date: string;         // ISO date YYYY-MM-DD
  amount: number;       // always positive
  originalAmount: number; // signed, as in OFX
  memo: string;         // MEMO field
  name: string;         // NAME field (counterpart)
  checkNum: string;     // CHECKNUM
}

export interface OFXStatement {
  bankId: string;
  accountId: string;
  accountType: string;
  currency: string;
  startDate: string;
  endDate: string;
  transactions: OFXTransaction[];
  ledgerBalance: number | null;
  availableBalance: number | null;
  balanceDate: string | null;
}

function getTagValue(xml: string, tag: string): string {
  // OFX uses SGML-style tags: <TAG>value (no closing tag sometimes)
  const patterns = [
    new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'),
    new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function parseOFXDate(raw: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  if (!raw || raw.length < 8) return '';
  const y = raw.substring(0, 4);
  const m = raw.substring(4, 6);
  const d = raw.substring(6, 8);
  return `${y}-${m}-${d}`;
}

function extractBlocks(text: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks: string[] = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  // Also try SGML-style without closing tags (common in Brazilian OFX)
  if (blocks.length === 0) {
    const sgmlRe = new RegExp(`<${tag}>([\\s\\S]*?)(?=<${tag}>|<\\/${tag.split('.')[0]}|$)`, 'gi');
    while ((match = sgmlRe.exec(text)) !== null) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

export function parseOFX(text: string): OFXStatement {
  // Normalize line endings
  const content = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const bankId = getTagValue(content, 'BANKID');
  const accountId = getTagValue(content, 'ACCTID');
  const accountType = getTagValue(content, 'ACCTTYPE') || 'CHECKING';
  const currency = getTagValue(content, 'CURDEF') || 'BRL';

  // Date range
  const dtStart = getTagValue(content, 'DTSTART');
  const dtEnd = getTagValue(content, 'DTEND');

  // Balances
  const ledgerStr = getTagValue(content, 'BALAMT');
  const ledgerBalance = ledgerStr ? parseFloat(ledgerStr.replace(',', '.')) : null;
  const balDateStr = getTagValue(content, 'DTASOF');

  // Extract transactions
  const txBlocks = extractBlocks(content, 'STMTTRN');
  const transactions: OFXTransaction[] = txBlocks.map((block, idx) => {
    const trnType = getTagValue(block, 'TRNTYPE').toUpperCase();
    const dtPosted = getTagValue(block, 'DTPOSTED');
    const amountStr = getTagValue(block, 'TRNAMT');
    const fitId = getTagValue(block, 'FITID') || `ofx-${idx}`;
    const name = getTagValue(block, 'NAME');
    const memo = getTagValue(block, 'MEMO');
    const checkNum = getTagValue(block, 'CHECKNUM');

    const originalAmount = parseFloat(amountStr.replace(',', '.')) || 0;

    return {
      id: fitId,
      type: originalAmount < 0 ? 'DEBIT' : originalAmount > 0 ? 'CREDIT' : 'OTHER',
      date: parseOFXDate(dtPosted),
      amount: Math.abs(originalAmount),
      originalAmount,
      memo: memo || name,
      name: name || memo,
      checkNum,
    };
  });

  return {
    bankId,
    accountId,
    accountType,
    currency,
    startDate: parseOFXDate(dtStart),
    endDate: parseOFXDate(dtEnd),
    transactions,
    ledgerBalance,
    availableBalance: null,
    balanceDate: parseOFXDate(balDateStr),
  };
}
