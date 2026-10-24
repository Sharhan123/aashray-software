import aashrayLogoUrl from '../assets/aashray-original.png';

export type ReceiptPdfData = {
  receiptNumber: string;
  paymentDate: string;
  amountPaise: number;
  method: string;
  reference?: string;
  notes?: string;
  allocatedPaise: number;
  unallocatedPaise: number;
  reversedAt?: string | null;
  reversalReason?: string;
  residentId?: {
    fullName?: string;
    residentId?: string;
    mobile?: string;
    securityDepositPaise?: number;
    rentSchedules?: { monthlyRentPaise: number }[];
  };
  allocation?: {
    roomId?: { roomNumber?: string; propertyName?: string; propertyId?: { name?: string } };
    bedId?: string;
  };
  breakdown?: { amountPaise: number; charge?: { periodKey?: string; servicePeriodStart?: string; servicePeriodEnd?: string; description?: string } }[];
};

export type CheckoutSummaryPdfData = {
  checkoutNumber: string;
  checkoutDate: string;
  checkedOutAt: string;
  reason: string;
  propertyName?: string;
  roomNumber?: string;
  bedId?: string;
  outstandingBeforePaise: number;
  depositHeldPaise: number;
  appliedToChargesPaise: number;
  refundedToDatePaise: number;
  depositRetainedPaise: number;
  refundableRemainingPaise: number;
  settlementDuePaise: number;
  settlementStatus: string;
  charges: { description: string; periodKey?: string; servicePeriodStart?: string; servicePeriodEnd?: string; amountPaise: number; appliedPaise: number; remainingPaise: number; currentBalancePaise?: number }[];
  finalBills: { description: string; periodKey?: string; servicePeriodStart?: string; servicePeriodEnd?: string; amountPaise: number; appliedPaise: number; remainingPaise: number; currentBalancePaise?: number }[];
  cancelledRentCharges?: { description: string; periodKey: string; amountPaise: number }[];
  resident?: { fullName?: string; residentId?: string; mobile?: string };
};

const BLUE = '#1681b4';
const NAVY = '#17264d';
const DARK_BLUE = '#116990';
const PALE_BLUE = '#f3f7fc';
const INK = '#3c4b64';
const MUTED = '#71809a';
const LINE = '#dce5f0';
const formatMoney = (paise = 0) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const chargePeriod = (charge?: { periodKey?: string; servicePeriodStart?: string; servicePeriodEnd?: string }) => charge?.servicePeriodStart && charge.servicePeriodEnd ? `${formatDate(charge.servicePeriodStart)} to ${formatDate(charge.servicePeriodEnd)}` : charge?.periodKey ?? '';

function makeReceiptCanvas(data: ReceiptPdfData, amountWords: string, brandLogo: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the receipt PDF.');
  const ctx = context;
  const left = 86; const right = canvas.width - 86; const width = right - left;
  const resident = data.residentId;
  const property = data.allocation?.roomId?.propertyId?.name ?? data.allocation?.roomId?.propertyName ?? 'Not assigned';
  const room = data.allocation?.roomId?.roomNumber ?? 'Not assigned';
  const bed = data.allocation?.bedId ?? 'Not assigned';
  const periods = [...new Set((data.breakdown ?? []).map((item) => chargePeriod(item.charge)).filter(Boolean))].sort();
  const monthlyRent = resident?.rentSchedules?.at(-1)?.monthlyRentPaise ?? 0;
  const note = [data.notes, data.reference ? `Reference: ${data.reference}` : '', data.unallocatedPaise ? `${formatMoney(data.unallocatedPaise)} is currently unallocated.` : '', data.reversedAt ? `Reversed${data.reversalReason ? `: ${data.reversalReason}` : ''}` : ''].filter(Boolean).join(' | ') || 'No additional notes.';
  const displayDate = formatDate(data.paymentDate);

  ctx.fillStyle = '#edf3f7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff'; ctx.fillRect(36, 36, canvas.width - 72, canvas.height - 72);
  const brandWash = ctx.createLinearGradient(left, 0, right, 0); brandWash.addColorStop(0, '#e9f7fa'); brandWash.addColorStop(.64, '#f7fbfd'); brandWash.addColorStop(1, '#f1effb');
  ctx.fillStyle = brandWash; ctx.fillRect(36, 36, canvas.width - 72, 166);
  ctx.fillStyle = BLUE; ctx.fillRect(36, 36, canvas.width - 72, 9);

  // Brand and document header.
  ctx.drawImage(brandLogo, left, 48, 290, 97);
  ctx.textAlign = 'right'; ctx.fillStyle = DARK_BLUE; ctx.font = 'bold 18px Arial, sans-serif'; ctx.fillText('SURAT, GUJARAT', right, 91);
  ctx.fillStyle = MUTED; ctx.font = '18px Arial, sans-serif'; ctx.fillText('Official payment receipt', right, 123);
  drawRule(ctx, left, 172, width);

  ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = 'bold 37px Arial, sans-serif'; ctx.fillText('Payment receipt', left, 235);
  ctx.fillStyle = MUTED; ctx.font = '19px Arial, sans-serif'; ctx.fillText('Receipt number', left, 274);
  ctx.fillStyle = INK; ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText(fitText(ctx, data.receiptNumber, 450), left + 155, 274);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = '19px Arial, sans-serif'; ctx.fillText('Issued', right - 190, 274);
  ctx.fillStyle = INK; ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText(displayDate, right, 274);

  // Amount received stands out as the primary figure.
  const amountWash = ctx.createLinearGradient(left, 315, right, 495); amountWash.addColorStop(0, '#eaf7fa'); amountWash.addColorStop(.7, '#f5f8fc'); amountWash.addColorStop(1, '#f2effb');
  ctx.fillStyle = amountWash; ctx.fillRect(left, 315, width, 180);
  ctx.strokeStyle = '#d6e8ee'; ctx.lineWidth = 2; ctx.strokeRect(left, 315, width, 180);
  ctx.fillStyle = BLUE; ctx.fillRect(left, 315, 8, 180);
  ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = 'bold 18px Arial, sans-serif'; ctx.fillText('AMOUNT RECEIVED', left + 34, 357);
  ctx.fillStyle = NAVY; ctx.font = 'bold 56px Arial, sans-serif'; ctx.fillText(formatMoney(data.amountPaise), left + 34, 425);
  ctx.fillStyle = INK; ctx.font = '19px Arial, sans-serif'; ctx.fillText('In words: ' + fitText(ctx, amountWords, width - 68), left + 34, 466);
  const statusText = data.reversedAt ? 'REVERSED' : 'PAID';
  const badgeWidth = data.reversedAt ? 150 : 112;
  ctx.fillStyle = data.reversedAt ? '#fff0f0' : '#e5f5ed'; ctx.beginPath(); ctx.roundRect(right - badgeWidth - 30, 340, badgeWidth, 42, 21); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = data.reversedAt ? '#a83434' : '#19734b'; ctx.font = 'bold 17px Arial, sans-serif'; ctx.fillText(statusText, right - badgeWidth / 2 - 30, 367);

  // Resident details.
  drawSectionTitle(ctx, left, 550, 'Billed to');
  ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = 'bold 29px Arial, sans-serif'; ctx.fillText(fitText(ctx, resident?.fullName || 'Resident', width), left, 600);
  ctx.fillStyle = INK; ctx.font = '19px Arial, sans-serif';
  ctx.fillText(`Resident ID: ${resident?.residentId || 'Not available'}`, left, 638);
  ctx.fillText(`Mobile: ${resident?.mobile || 'Not available'}`, left + 410, 638);
  ctx.fillText(`Property: ${fitText(ctx, property, width - 115)}`, left, 676);

  // Payment metadata in a restrained two-column information panel.
  drawSectionTitle(ctx, left, 744, 'Payment details');
  drawRule(ctx, left, 766, width);
  drawField(ctx, left, 812, 'Payment date', displayDate, 480);
  drawField(ctx, left + 540, 812, 'Payment method', data.method.replaceAll('_', ' '), 500);
  drawField(ctx, left, 880, 'Reference', data.reference || 'Not provided', 480);
  drawField(ctx, left + 540, 880, 'Allocation status', data.unallocatedPaise > 0 ? 'Partially / not allocated' : 'Allocated', 500);

  // Resident and room information is explicitly labeled as current context.
  drawSectionTitle(ctx, left, 970, 'Accommodation details');
  drawRule(ctx, left, 992, width);
  drawField(ctx, left, 1038, 'Room', room, 320);
  drawField(ctx, left + 365, 1038, 'Bed', bed, 280);
  drawField(ctx, left + 700, 1038, 'Billed period', periods.length ? `${periods[0]}${periods.length > 1 ? ` to ${periods.at(-1)}` : ''}` : 'No charge linked', 360);
  drawField(ctx, left, 1102, 'Monthly rent (current)', formatMoney(monthlyRent), 480);
  drawField(ctx, left + 540, 1102, 'Deposit held (current)', formatMoney(resident?.securityDepositPaise ?? 0), 500);

  // Allocations reconcile the payment to the resident ledger.
  drawSectionTitle(ctx, left, 1192, 'Payment allocation');
  const tableY = 1220; const tableRight = right;
  ctx.fillStyle = PALE_BLUE; ctx.fillRect(left, tableY, width, 45);
  ctx.fillStyle = DARK_BLUE; ctx.font = 'bold 16px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('CHARGE / PERIOD', left + 14, tableY + 29); ctx.textAlign = 'right'; ctx.fillText('AMOUNT', tableRight - 14, tableY + 29);
  const breakdown = data.breakdown ?? []; const shown = breakdown.slice(0, 3); let rowY = tableY + 45;
  if (!shown.length) {
    drawAllocationRow(ctx, left, rowY, width, 'Payment recorded to resident account', 'Not linked to a charge'); rowY += 50;
  } else {
    for (const item of shown) {
      const description = [item.charge?.description, chargePeriod(item.charge)].filter(Boolean).join(' | ') || 'Resident charge';
      drawAllocationRow(ctx, left, rowY, width, description, formatMoney(item.amountPaise)); rowY += 50;
    }
    if (breakdown.length > shown.length) {
      drawAllocationRow(ctx, left, rowY, width, `${breakdown.length - shown.length} additional charge(s)`, 'See account ledger'); rowY += 50;
    }
  }
  drawRule(ctx, left, rowY, width, LINE);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = '18px Arial, sans-serif'; ctx.fillText('Total received', right - 205, rowY + 36);
  ctx.fillStyle = NAVY; ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillText(formatMoney(data.amountPaise), right, rowY + 38);

  const noteY = Math.max(rowY + 95, 1500);
  drawSectionTitle(ctx, left, noteY, 'Notes');
  ctx.fillStyle = INK; ctx.font = '18px Arial, sans-serif'; ctx.textAlign = 'left';
  wrapText(ctx, note, left, noteY + 38, width, 27, 2);
  drawRule(ctx, left, 1654, width);
  ctx.fillStyle = MUTED; ctx.font = '16px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Thank you for your payment.', left, 1690);
  ctx.textAlign = 'right'; ctx.fillText('Aashray Hospitality  |  Payment receipt - not a tax invoice', right, 1690);
  return canvas;
}

function drawRule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color = LINE) {
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
}

function drawSectionTitle(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = 'bold 23px Arial, sans-serif'; ctx.fillText(label, x, y);
}

function drawField(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, maxWidth: number) {
  ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = '17px Arial, sans-serif'; ctx.fillText(label, x, y);
  ctx.fillStyle = INK; ctx.font = 'bold 19px Arial, sans-serif'; ctx.fillText(fitText(ctx, value, maxWidth), x, y + 29);
}

function drawAllocationRow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, description: string, amount: string) {
  ctx.fillStyle = INK; ctx.font = '17px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fitText(ctx, description, width - 260), x + 14, y + 31);
  ctx.textAlign = 'right'; ctx.fillText(fitText(ctx, amount, 220), x + width - 14, y + 31);
  drawRule(ctx, x, y + 50, width, LINE);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/); let line = ''; let lineNumber = 0;
  for (let index = 0; index < words.length; index++) {
    const next = line ? `${line} ${words[index]}` : words[index]!;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y + lineNumber * lineHeight); line = words[index]!; lineNumber++;
      if (lineNumber === maxLines - 1 && index < words.length - 1) { line = `${line} ...`; break; }
    } else line = next;
  }
  if (line) ctx.fillText(fitText(ctx, line, width), x, y + lineNumber * lineHeight);
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let text = value || 'Not available';
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = `${text.slice(0, -2)}...`;
  return text;
}

function bytes(text: string) { return new TextEncoder().encode(text); }

async function createPdf(canvas: HTMLCanvasElement) {
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Receipt image could not be generated.')), 'image/jpeg', 0.94));
  const imageBytes = new Uint8Array(await jpeg.arrayBuffer());
  const stream = bytes('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n');
  const objects: Uint8Array[] = [
    bytes('<< /Type /Catalog /Pages 2 0 R >>'),
    bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    concat([bytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`), imageBytes, bytes('\nendstream')]),
    concat([bytes(`<< /Length ${stream.length} >>\nstream\n`), stream, bytes('endstream')]),
  ];
  const chunks: Uint8Array[] = [bytes('%PDF-1.4\n')]; const offsets = [0]; let offset = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(offset); const wrapped = concat([bytes(`${index + 1} 0 obj\n`), object, bytes('\nendobj\n')]); chunks.push(wrapped); offset += wrapped.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const entry of offsets.slice(1)) xref += `${String(entry).padStart(10, '0')} 00000 n \n`;
  chunks.push(bytes(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob(chunks, { type: 'application/pdf' });
}

export type ReportPdfRow = Record<string, unknown>;
export function openReportPrintView(report: string, rows: ReportPdfRow[], range: { from?: string; to?: string; propertyId?: string }, printWindow: Window | null) {
  if (!printWindow) throw new Error('The report print window was blocked. Allow pop-ups for this site and try again.');
  const maxRows = 1000;
  if (rows.length > maxRows) throw new Error(`This report has ${rows.length.toLocaleString('en-IN')} rows. Print-ready PDF is limited to ${maxRows.toLocaleString('en-IN')} rows per file. Narrow the date range or download CSV for the complete report.`);
  const columns = rows.length ? Object.keys(rows[0]!) : ['result'];
  const generatedAt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date());
  const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const formatValue = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return '—';
    if (key.toLowerCase().includes('rupees') && typeof value === 'number') return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const title = report.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  const headings = columns.map((column) => `<th>${escapeHtml(column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '))}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(column, row[column])) || '—'}</td>`).join('')}</tr>`).join('');
  const rangeText = range.from || range.to ? `${range.from || 'Any start'} to ${range.to || 'Current'}` : 'All available dates';
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Aashray ${escapeHtml(title)} report</title><style>
    @page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#20384b;font:12px Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.topline{height:7px;background:linear-gradient(90deg,#1681b4,#48b2d1,#8673c5);margin-bottom:22px}.brand{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce7ed;padding:0 0 14px}.brand img{max-width:180px;max-height:58px;object-fit:contain}.brand span,.meta small{color:#668095;font-size:9px;font-weight:bold;letter-spacing:.14em}.heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin:22px 0 14px}.heading h1{margin:0 0 5px;color:#18354b;font-size:24px}.heading p{margin:0;color:#63798b;font-size:11px}.meta{text-align:right;color:#60788b;font-size:10px;line-height:1.7}.scope{margin:0 0 13px;padding:9px 12px;border:1px solid #d9e7ed;border-radius:7px;background:#f2f8fa;color:#49677b;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{padding:9px 8px;background:#e9f3f7;color:#34566b;text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.05em;border-bottom:1px solid #cfdee5}td{padding:7px 8px;border-bottom:1px solid #e3ebef;color:#3f5567;font-size:10px;line-height:1.35;overflow-wrap:anywhere;vertical-align:top}tbody tr:nth-child(even){background:#f7fafc}tr{break-inside:avoid;page-break-inside:avoid}.foot{margin-top:15px;padding-top:9px;border-top:1px solid #dce7ed;color:#75899a;font-size:9px}.screen-note{margin:12px 0;color:#526a7d;font-size:12px}@media screen{body{max-width:1200px;margin:30px auto;padding:28px;box-shadow:0 8px 40px #132d421c}.topline{border-radius:9px}}
    </style></head><body><div class="topline"></div><header class="brand"><img src="${escapeHtml(aashrayLogoUrl)}" alt="Aashray Hospitality"><span>OPERATIONS REPORT</span></header><section class="heading"><div><h1>${escapeHtml(title)} report</h1><p>${escapeHtml(rangeText)}</p></div><div class="meta"><small>GENERATED</small><br>${escapeHtml(generatedAt)}<br>${rows.length.toLocaleString('en-IN')} records</div></section>${range.propertyId ? `<p class="scope">Property scope: ${escapeHtml(range.propertyId)}</p>` : ''}<table><thead><tr>${headings}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(1, columns.length)}">No records found for this report and date range.</td></tr>`}</tbody></table><footer class="foot">Aashray Hospitality · Values and financial status are shown as returned by the report service.</footer><p class="screen-note">Use your browser’s print dialog and select “Save as PDF”.</p></body></html>`);
  printWindow.document.close();
  let printed = false;
  const startPrint = () => { if (printed) return; printed = true; window.setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 500); };
  printWindow.addEventListener('load', startPrint, { once: true });
  window.setTimeout(startPrint, 1200);
}
function concat(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

async function loadBrandLogo() {
  const image = new Image(); image.src = aashrayLogoUrl; await image.decode(); return image;
}

export async function downloadReceiptPdf(data: ReceiptPdfData, amountWords: string) {
  const brandLogo = await loadBrandLogo();
  const canvas = makeReceiptCanvas(data, amountWords, brandLogo);
  const blob = await createPdf(canvas);
  saveReceiptBlob(blob, data.receiptNumber);
}

function saveReceiptBlob(blob: Blob, receiptNumber: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${receiptNumber.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function receiptBlob(data: ReceiptPdfData, amountWords: string) {
  const brandLogo = await loadBrandLogo();
  return createPdf(makeReceiptCanvas(data, amountWords, brandLogo));
}

export async function printReceiptPdf(data: ReceiptPdfData, amountWords: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups to open the receipt for printing.');
  try {
    const blob = await receiptBlob(data, amountWords);
    const url = URL.createObjectURL(blob);
    printWindow.location.href = url;
    window.setTimeout(() => { try { printWindow.print(); } catch { /* The PDF viewer can still print from its toolbar. */ } }, 900);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) { printWindow.close(); throw error; }
}

export async function shareReceiptPdf(data: ReceiptPdfData, amountWords: string) {
  const blob = await receiptBlob(data, amountWords);
  const file = new File([blob], `${data.receiptNumber.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'Aashray payment receipt', files: [file] });
  else saveReceiptBlob(blob, data.receiptNumber);
}

function checkoutRefundDeadline(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day + 21, 12));
}

function makeCheckoutCanvas(data: CheckoutSummaryPdfData, brandLogo: HTMLImageElement) {
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not prepare the checkout summary PDF.');
  const left = 86; const right = canvas.width - 86; const width = right - left;
  const deadline = formatDate(checkoutRefundDeadline(data.checkoutDate).toISOString());
  const rows = [...data.charges, ...data.finalBills];
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = BLUE; ctx.fillRect(0, 0, canvas.width, 18);
  ctx.drawImage(brandLogo, left, 48, 290, 97); ctx.textAlign = 'right'; ctx.fillStyle = DARK_BLUE; ctx.font = 'bold 18px Arial, sans-serif'; ctx.fillText('SURAT, GUJARAT', right, 91); ctx.fillStyle = MUTED; ctx.font = '18px Arial, sans-serif'; ctx.fillText('Resident checkout statement', right, 123); drawRule(ctx, left, 172, width);
  ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = 'bold 37px Arial, sans-serif'; ctx.fillText('Checkout summary', left, 235);
  drawField(ctx, left, 284, 'Resident', data.resident?.fullName || 'Resident', 500); drawField(ctx, left + 540, 284, 'Resident ID', data.resident?.residentId || 'Not available', 500);
  drawField(ctx, left, 354, 'Mobile', data.resident?.mobile || 'Not available', 500); drawField(ctx, left + 540, 354, 'Checkout date', formatDate(data.checkoutDate), 500);
  drawField(ctx, left, 424, 'Property / room / bed', `${data.propertyName || 'Not assigned'} / ${data.roomNumber || '—'} / ${data.bedId || '—'}`, width); drawField(ctx, left, 494, 'Checkout reason', data.reason || 'Not provided', width);
  drawSectionTitle(ctx, left, 580, 'Settlement status');
  ctx.fillStyle = PALE_BLUE; ctx.fillRect(left, 600, width, 220); ctx.fillStyle = BLUE; ctx.fillRect(left, 600, 8, 220);
  drawField(ctx, left + 30, 646, 'Outstanding at checkout', formatMoney(data.outstandingBeforePaise), 320);
  drawField(ctx, left + 390, 646, 'Payable to Aashray now', formatMoney(data.settlementDuePaise), 320);
  drawField(ctx, left + 750, 646, 'Payment status', data.settlementStatus === 'PAID' ? 'PAID' : data.settlementStatus === 'DUE' ? 'DUE / UNPAID' : data.settlementStatus === 'NO_DUE' ? 'NO DUE' : 'HISTORICAL RECORD', 300);
  drawField(ctx, left + 30, 728, 'Deposit held', formatMoney(data.depositHeldPaise), 320);
  drawField(ctx, left + 390, 728, 'Applied to charges', formatMoney(data.appliedToChargesPaise), 320);
  ctx.fillStyle = '#d9f3e7'; ctx.fillRect(left + 738, 704, 318, 78); ctx.strokeStyle = '#56a77d'; ctx.lineWidth = 2; ctx.strokeRect(left + 738, 704, 318, 78);
  ctx.textAlign = 'left'; ctx.fillStyle = '#315f48'; ctx.font = 'bold 17px Arial, sans-serif'; ctx.fillText('REFUNDABLE DEPOSIT', left + 750, 730);
  ctx.fillStyle = '#12683d'; ctx.font = 'bold 29px Arial, sans-serif'; ctx.fillText(fitText(ctx, formatMoney(data.refundableRemainingPaise), 290), left + 750, 766);
  if (data.settlementDuePaise > 0) { ctx.textAlign = 'left'; ctx.fillStyle = DARK_BLUE; ctx.font = 'bold 15px Arial, sans-serif'; ctx.fillText('Remaining settlement amount is payable to Aashray Hospitality.', left + 30, 808); }
  drawSectionTitle(ctx, left, 880, 'Outstanding charge details');
  let y = 906; ctx.fillStyle = PALE_BLUE; ctx.fillRect(left, y, width, 44); ctx.fillStyle = DARK_BLUE; ctx.font = 'bold 15px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('CHARGE', left + 12, y + 28); ctx.textAlign = 'right'; ctx.fillText('AT CHECKOUT', right - 260, y + 28); ctx.fillText('BALANCE NOW', right - 12, y + 28); y += 44;
  const shown = rows.slice(0, 7);
  if (!shown.length) { drawAllocationRow(ctx, left, y, width, 'No outstanding charge recorded at checkout', 'Rs. 0.00'); y += 50; }
  else for (const row of shown) { const label = [row.description, chargePeriod(row)].filter(Boolean).join(' · '); const now = row.currentBalancePaise ?? row.remainingPaise; ctx.fillStyle = INK; ctx.font = '16px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fitText(ctx, label, width - 500), left + 12, y + 29); ctx.textAlign = 'right'; ctx.fillText(formatMoney(row.remainingPaise), right - 260, y + 29); ctx.fillText(formatMoney(now), right - 12, y + 29); drawRule(ctx, left, y + 48, width); y += 50; }
  if (rows.length > shown.length) { ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = '15px Arial, sans-serif'; ctx.fillText(`${rows.length - shown.length} additional charges are listed in the resident ledger.`, left + 12, y + 26); y += 42; }
  if (data.cancelledRentCharges?.length) { ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = '15px Arial, sans-serif'; ctx.fillText(fitText(ctx, `Cancelled next-cycle rent: ${data.cancelledRentCharges.map((charge) => `${charge.periodKey} (${formatMoney(charge.amountPaise)})`).join(', ')}`, width - 24), left + 12, y + 24); y += 36; }
  y = Math.max(y + 30, 1330); drawSectionTitle(ctx, left, y, 'Security deposit refund');
  ctx.fillStyle = PALE_BLUE; ctx.fillRect(left, y + 20, width, 125); ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = '18px Arial, sans-serif';
  wrapText(ctx, `Refundable deposit: ${formatMoney(data.refundableRemainingPaise)}. This amount will be refunded only after 21 days from checkout, on or after ${deadline}. Refunds recorded to date: ${formatMoney(data.refundedToDatePaise)}.`, left + 20, y + 58, width - 40, 28, 3);
  drawRule(ctx, left, 1654, width); ctx.fillStyle = MUTED; ctx.font = '16px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Aashray Hospitality  |  Checkout settlement summary', left, 1690); ctx.textAlign = 'right'; ctx.fillText('Prepared from saved resident and financial ledgers', right, 1690);
  return canvas;
}

async function checkoutSummaryBlob(data: CheckoutSummaryPdfData) { const logo = await loadBrandLogo(); return createPdf(makeCheckoutCanvas(data, logo)); }

function saveCheckoutBlob(blob: Blob, checkoutNumber: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Aashray-checkout-${checkoutNumber.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCheckoutSummaryPdf(data: CheckoutSummaryPdfData) { saveCheckoutBlob(await checkoutSummaryBlob(data), data.checkoutNumber); }

export async function printCheckoutSummaryPdf(data: CheckoutSummaryPdfData) {
  const printWindow = window.open('', '_blank'); if (!printWindow) throw new Error('Allow pop-ups to open the checkout summary for printing.');
  try { const url = URL.createObjectURL(await checkoutSummaryBlob(data)); printWindow.location.href = url; window.setTimeout(() => { try { printWindow.print(); } catch { /* The PDF viewer can still print from its toolbar. */ } }, 900); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  catch (error) { printWindow.close(); throw error; }
}
