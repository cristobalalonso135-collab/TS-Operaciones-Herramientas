function unquoteCell(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

export function splitDelimitedRow(row: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      out.push(unquoteCell(cur));
      cur = '';
      continue;
    }
    cur += char;
  }
  out.push(unquoteCell(cur));
  return out;
}

export function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const char of headerLine) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === ';' || char === ',' || char === '\t')) {
      counts[char] += 1;
    }
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > 0) return '\t';
  return ',';
}

export function parseDelimitedText(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  return lines
    .map((line) => splitDelimitedRow(line, delimiter))
    .filter((row) => row.some((cell) => cell !== ''));
}

export function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
}
