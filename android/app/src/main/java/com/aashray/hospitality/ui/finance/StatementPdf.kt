package com.aashray.hospitality.ui.finance

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.aashray.hospitality.BuildConfig
import java.io.File
import java.io.FileOutputStream

data class StatementLine(val date: String, val category: String, val detail: String, val method: String, val amount: String, val note: String = "")

object StatementPdf {
    private const val WIDTH = 595
    private const val HEIGHT = 842
    private const val BLUE = 0xff1678b6.toInt()
    private const val NAVY = 0xff1a3655.toInt()
    private const val MUTED = 0xff64748b.toInt()

    fun create(context: Context, residentName: String, residentCode: String, from: String, to: String, rows: List<StatementLine>, documentTitle: String = "RESIDENT TRANSACTION STATEMENT"): File {
        val document = PdfDocument()
        val pageSize = 9
        val pages = rows.chunked(pageSize).ifEmpty { listOf(emptyList()) }
        pages.forEachIndexed { index, entries ->
            val page = document.startPage(PdfDocument.PageInfo.Builder(WIDTH, HEIGHT, index + 1).create())
            drawPage(page.canvas, residentName, residentCode, from, to, entries, index + 1, pages.size, documentTitle)
            document.finishPage(page)
        }
        val file = File(context.cacheDir, "resident-statement-${residentCode.replace(Regex("[^A-Za-z0-9-]"), "_")}.pdf")
        FileOutputStream(file).use(document::writeTo)
        document.close()
        return file
    }

    fun share(context: Context, file: File) {
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = android.content.ClipData.newUri(context.contentResolver, file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Save or share resident statement"))
    }

    private fun drawPage(canvas: Canvas, name: String, code: String, from: String, to: String, rows: List<StatementLine>, page: Int, totalPages: Int, documentTitle: String) {
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = BLUE; paint.strokeWidth = 1.2f
        canvas.drawRoundRect(24f, 24f, WIDTH - 24f, HEIGHT - 24f, 8f, 8f, paint.apply { style = Paint.Style.STROKE })
        paint.style = Paint.Style.FILL
        drawText(canvas, "AASHRAY HOSPITALITY", 44f, 58f, 16f, BLUE, true)
        drawText(canvas, documentTitle, 44f, 88f, 13f, NAVY, true)
        drawText(canvas, "$name · $code", 44f, 116f, 10f, NAVY, true)
        drawText(canvas, "Period: $from to $to", 44f, 136f, 9f, MUTED)
        canvas.drawLine(44f, 154f, WIDTH - 44f, 154f, paint.apply { color = BLUE; strokeWidth = 1f })
        drawText(canvas, "DATE", 46f, 178f, 8f, MUTED, true)
        drawText(canvas, "TYPE / DETAILS", 122f, 178f, 8f, MUTED, true)
        drawText(canvas, "METHOD", 390f, 178f, 8f, MUTED, true)
        drawText(canvas, "AMOUNT", 486f, 178f, 8f, MUTED, true)
        var y = 203f
        rows.forEach { row ->
            canvas.drawLine(44f, y + 8f, WIDTH - 44f, y + 8f, paint.apply { color = 0xffd9e5ee.toInt(); strokeWidth = .5f })
            drawText(canvas, row.date.take(10), 46f, y + 26f, 8f, NAVY)
            drawText(canvas, row.category, 122f, y + 22f, 8f, BLUE, true)
            drawText(canvas, row.detail, 122f, y + 36f, 8f, NAVY, maxWidth = 245f)
            if (row.note.isNotBlank()) drawText(canvas, row.note, 122f, y + 49f, 7f, MUTED, maxWidth = 245f)
            drawText(canvas, row.method, 390f, y + 26f, 8f, NAVY, maxWidth = 78f)
            drawText(canvas, row.amount, 480f, y + 26f, 8f, NAVY, true, maxWidth = 68f)
            y += 62f
        }
        if (rows.isEmpty()) drawText(canvas, "No transactions in this date range.", 46f, 218f, 10f, MUTED)
        drawText(canvas, "Page $page of $totalPages · Generated from the Aashray server ledger", 44f, HEIGHT - 46f, 8f, MUTED)
    }

    private fun drawText(canvas: Canvas, value: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean = false, maxWidth: Float = 0f) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color; textSize = size
            typeface = if (bold) Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD) else Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        }
        var text = value.replace('\n', ' ')
        if (maxWidth > 0f && paint.measureText(text) > maxWidth) {
            while (text.length > 1 && paint.measureText("$text…") > maxWidth) text = text.dropLast(1)
            text += "…"
        }
        canvas.drawText(text, x, y, paint)
    }
}
