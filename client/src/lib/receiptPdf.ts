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
  breakdown?: { amountPaise: number; charge?: { periodKey?: string; description?: string } }[];
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
  const periods = [...new Set((data.breakdown ?? []).map((item) => item.charge?.periodKey).filter((period): period is string => Boolean(period)))].sort();
  const monthlyRent = resident?.rentSchedules?.at(-1)?.monthlyRentPaise ?? 0;
  const note = [data.notes, data.reference ? `Reference: ${data.reference}` : '', data.unallocatedPaise ? `${formatMoney(data.unallocatedPaise)} is currently unallocated.` : '', data.reversedAt ? `Reversed${data.reversalReason ? `: ${data.reversalReason}` : ''}` : ''].filter(Boolean).join(' | ') || 'No additional notes.';
  const displayDate = formatDate(data.paymentDate);

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, canvas.width, 18);

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
  ctx.fillStyle = PALE_BLUE; ctx.fillRect(left, 315, width, 180);
  ctx.fillStyle = BLUE; ctx.fillRect(left, 315, 8, 180);
  ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = 'bold 18px Arial, sans-serif'; ctx.fillText('AMOUNT RECEIVED', left + 34, 357);
  ctx.fillStyle = NAVY; ctx.font = 'bold 56px Arial, sans-serif'; ctx.fillText(formatMoney(data.amountPaise), left + 34, 425);
  ctx.fillStyle = INK; ctx.font = '19px Arial, sans-serif'; ctx.fillText('In words: ' + fitText(ctx, amountWords, width - 68), left + 34, 466);
  const statusText = data.reversedAt ? 'REVERSED' : 'PAID';
  const badgeWidth = data.reversedAt ? 150 : 112;
  ctx.fillStyle = data.reversedAt ? '#fff0f0' : '#e5f5ed'; ctx.fillRect(right - badgeWidth - 30, 340, badgeWidth, 42);
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
      const description = [item.charge?.description, item.charge?.periodKey].filter(Boolean).join(' | ') || 'Resident charge';
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
