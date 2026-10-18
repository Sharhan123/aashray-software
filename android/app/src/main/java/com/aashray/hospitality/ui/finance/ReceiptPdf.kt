package com.aashray.hospitality.ui.finance

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.core.content.FileProvider
import com.aashray.hospitality.BuildConfig
import com.aashray.hospitality.R
import com.aashray.hospitality.data.ReceiptResponse
import java.io.File
import java.io.FileOutputStream

object ReceiptPdf {
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val BLUE = 0xff1678b6.toInt()
    private const val NAVY = 0xff1a3655.toInt()
    private const val PALE_BLUE = 0xffeef6fc.toInt()
    private const val MUTED = 0xff64748b.toInt()

    fun create(context: Context, receipt: ReceiptResponse): File {
        val document = PdfDocument()
        val page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, 1).create())
        drawPage(context, page.canvas, receipt)
        document.finishPage(page)
        val file = File(context.cacheDir, "receipt-${safeName(receipt.receiptNumber)}.pdf")
        FileOutputStream(file).use(document::writeTo)
        document.close()
        return file
    }

    fun print(context: Context, file: File, title: String) {
        val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
        manager.print(title, ReceiptPrintAdapter(file), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_COLOR).build())
    }

    fun share(context: Context, file: File) {
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(android.content.Intent.EXTRA_STREAM, uri)
            clipData = android.content.ClipData.newUri(context.contentResolver, file.name, uri)
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(android.content.Intent.createChooser(intent, "Share Aashray receipt"))
    }

    private fun drawPage(context: Context, canvas: Canvas, receipt: ReceiptResponse) {
        canvas.drawColor(Color.WHITE)
        val bluePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = BLUE; style = Paint.Style.STROKE; strokeWidth = 1.5f }
        canvas.drawRoundRect(RectF(24f, 24f, PAGE_WIDTH - 24f, PAGE_HEIGHT - 24f), 8f, 8f, bluePaint)
        canvas.drawRoundRect(RectF(30f, 30f, PAGE_WIDTH - 30f, PAGE_HEIGHT - 30f), 6f, 6f, bluePaint.apply { strokeWidth = .6f })

        drawLogo(context, canvas)
        text(canvas, "PAYMENT RECEIPT", 196f, 62f, 19f, NAVY, bold = true)
        text(canvas, "Aashray Hospitality · Paying Guest Accommodation", 196f, 84f, 9f, MUTED)
        text(canvas, "RECEIPT NO.", 385f, 48f, 8f, MUTED, bold = true)
        text(canvas, receipt.receiptNumber, 385f, 64f, 9f, BLUE, bold = true)
        canvas.drawLine(46f, 112f, PAGE_WIDTH - 46f, 112f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = BLUE; strokeWidth = 1.3f })

        labelValue(canvas, "RECEIVED FROM", receipt.payment.resident?.fullName.orEmpty(), 48f, 144f, 270f)
        labelValue(canvas, "DATE", receipt.payment.paymentDate?.take(10).orEmpty(), 356f, 144f, 190f)
        val resident = receipt.payment.resident
        labelValue(canvas, "RESIDENT ID", resident?.residentId.orEmpty(), 48f, 190f, 160f)
        labelValue(canvas, "MOBILE", resident?.mobile.orEmpty(), 218f, 190f, 185f)
        labelValue(canvas, "PROPERTY", receipt.allocation?.room?.property?.name.orEmpty().ifBlank { "Aashray Hospitality" }, 408f, 190f, 140f)
        labelValue(canvas, "ROOM / BED", listOfNotNull(receipt.allocation?.room?.roomNumber?.takeIf(String::isNotBlank), receipt.allocation?.bedId?.takeIf(String::isNotBlank)?.let { "Bed $it" }).joinToString(" · ").ifBlank { "—" }, 48f, 236f, 240f)
        labelValue(canvas, "PAYMENT METHOD", receipt.payment.method.replace('_', ' '), 306f, 236f, 240f)

        val tableLeft = 48f; val tableRight = PAGE_WIDTH - 48f; val headerY = 278f; val rowHeight = 42f
        canvas.drawRoundRect(RectF(tableLeft, headerY, tableRight, headerY + rowHeight), 5f, 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PALE_BLUE })
        text(canvas, "DESCRIPTION", tableLeft + 12, headerY + 26, 9f, NAVY, true)
        text(canvas, "PERIOD", 358f, headerY + 26, 9f, NAVY, true)
        text(canvas, "AMOUNT", 481f, headerY + 26, 9f, NAVY, true)
        var rowY = headerY + rowHeight
        val lines = receipt.breakdown.ifEmpty { listOf() }
        if (lines.isEmpty()) {
            tableRow(canvas, "Payment received", "—", receipt.payment.amountPaise, rowY)
            rowY += rowHeight
        } else {
            lines.take(7).forEach { item ->
                tableRow(canvas, item.charge?.description ?: item.charge?.kind ?: "Charge payment", item.charge?.periodKey.orEmpty().ifBlank { "—" }, item.amountPaise, rowY)
                rowY += rowHeight
            }
            val remaining = receipt.breakdown.drop(7)
            if (remaining.isNotEmpty()) tableRow(canvas, "Other ${remaining.size} allocated charge(s)", "—", remaining.sumOf { it.amountPaise }, rowY).also { rowY += rowHeight }
        }
        val totalY = rowY + 26f
        canvas.drawLine(tableLeft, rowY, tableRight, rowY, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = BLUE; strokeWidth = 1f })
        text(canvas, "TOTAL RECEIVED", tableLeft + 12, totalY, 10f, NAVY, true)
        text(canvas, money(receipt.payment.amountPaise), 452f, totalY, 13f, BLUE, true)
        labelValue(canvas, "REFERENCE", receipt.payment.reference.ifBlank { "—" }, 48f, totalY + 44, 250f)
        labelValue(canvas, "NOTES", receipt.payment.notes.ifBlank { "Payment received with thanks." }, 306f, totalY + 44, 240f)

        val termsTop = (totalY + 102).coerceAtMost(PAGE_HEIGHT - 180f)
        canvas.drawRoundRect(RectF(48f, termsTop, tableRight, termsTop + 82f), 5f, 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PALE_BLUE })
        text(canvas, "ACKNOWLEDGEMENT", 62f, termsTop + 21, 8f, NAVY, true)
        text(canvas, "This receipt acknowledges only the payment amount recorded above.", 62f, termsTop + 40, 8f, NAVY)
        text(canvas, "Please retain this receipt for your records. Subject to Surat jurisdiction.", 62f, termsTop + 57, 8f, NAVY)
        canvas.drawLine(380f, PAGE_HEIGHT - 94f, tableRight, PAGE_HEIGHT - 94f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = BLUE; strokeWidth = .8f })
        text(canvas, "RECEIVED SIGNATURE", 414f, PAGE_HEIGHT - 78f, 8f, NAVY, true)
        text(canvas, "Aashray Hospitality · Computer generated receipt", 48f, PAGE_HEIGHT - 58f, 7f, MUTED)
    }

    private fun drawLogo(context: Context, canvas: Canvas) {
        val bitmap = BitmapFactory.decodeResource(context.resources, R.drawable.aashray_original) ?: return
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        var left = bitmap.width; var top = bitmap.height; var right = 0; var bottom = 0
        pixels.forEachIndexed { index, color ->
            val r = Color.red(color); val g = Color.green(color); val b = Color.blue(color)
            if (Color.alpha(color) > 40 && b > r + 25 && g > r + 12) {
                val x = index % bitmap.width; val y = index / bitmap.width
                left = minOf(left, x); top = minOf(top, y); right = maxOf(right, x); bottom = maxOf(bottom, y)
            }
        }
        if (right > left && bottom > top) canvas.drawBitmap(bitmap, Rect(left, top, right + 1, bottom + 1), RectF(48f, 44f, 176f, 102f), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        bitmap.recycle()
    }

    private fun labelValue(canvas: Canvas, label: String, value: String, x: Float, y: Float, maxWidth: Float) {
        text(canvas, label, x, y, 7f, MUTED, true)
        text(canvas, value.ifBlank { "—" }, x, y + 18, 9f, NAVY, maxWidth = maxWidth)
    }

    private fun tableRow(canvas: Canvas, description: String, period: String, amountPaise: Long, y: Float) {
        canvas.drawLine(48f, y + 42f, PAGE_WIDTH - 48f, y + 42f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xffd9e5ee.toInt(); strokeWidth = .5f })
        text(canvas, description, 60f, y + 25f, 8f, NAVY, maxWidth = 280f)
        text(canvas, period, 358f, y + 25f, 8f, NAVY, maxWidth = 100f)
        text(canvas, money(amountPaise), 478f, y + 25f, 8f, NAVY, true, maxWidth = 68f)
    }

    private fun text(canvas: Canvas, value: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean = false, maxWidth: Float = 0f) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; textSize = size; typeface = if (bold) Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD) else Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL) }
        val printable = if (maxWidth > 0 && paint.measureText(value) > maxWidth) {
            var reduced = value
            while (reduced.length > 1 && paint.measureText("$reduced…") > maxWidth) reduced = reduced.dropLast(1)
            "$reduced…"
        } else value
        canvas.drawText(printable, x, y, paint)
    }

    private fun money(paise: Long): String = "₹" + "%,.2f".format(java.util.Locale("en", "IN"), paise / 100.0)
    private fun safeName(value: String) = value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifBlank { "aashray" }
}

private class ReceiptPrintAdapter(private val file: File) : PrintDocumentAdapter() {
    override fun onLayout(oldAttributes: PrintAttributes?, newAttributes: PrintAttributes, cancellationSignal: CancellationSignal, callback: LayoutResultCallback, extras: android.os.Bundle?) {
        if (cancellationSignal.isCanceled) callback.onLayoutCancelled()
        else callback.onLayoutFinished(PrintDocumentInfo.Builder(file.name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(1).build(), true)
    }

    override fun onWrite(pages: Array<out PageRange>, destination: ParcelFileDescriptor, cancellationSignal: CancellationSignal, callback: WriteResultCallback) {
        if (cancellationSignal.isCanceled) { callback.onWriteCancelled(); return }
        runCatching {
            file.inputStream().use { input -> FileOutputStream(destination.fileDescriptor).use(input::copyTo) }
        }.onSuccess { callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES)) }
            .onFailure { callback.onWriteFailed(it.message) }
    }
}
