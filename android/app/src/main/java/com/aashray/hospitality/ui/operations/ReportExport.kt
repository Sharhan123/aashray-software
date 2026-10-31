package com.aashray.hospitality.ui.operations

import android.content.Context
import com.aashray.hospitality.ui.finance.StatementLine
import com.aashray.hospitality.ui.finance.StatementPdf
import java.io.File
import java.util.Locale

object ReportExport {
    fun pdf(context: Context, title: String, from: String, to: String, rows: List<Map<String, Any?>>): File {
        val lines = rows.mapIndexed { index, row ->
            val name = (row["name"] ?: row["resident"] ?: row["roomNumber"] ?: row["residentId"] ?: "Record ${index + 1}").toString()
            val details = row.filterKeys { it !in setOf("name", "resident", "_id", "__v") }
                .entries.joinToString(" · ") { (key, value) -> "${key.replace('_', ' ').replaceFirstChar(Char::uppercase)}: ${value ?: "—"}" }
            StatementLine(date = (row["date"] ?: row["createdAt"] ?: row["paymentDate"] ?: "").toString().take(10), category = title, detail = "$name · $details", method = "", amount = "")
        }
        return StatementPdf.create(context, "Aashray Hospitality · $title", "REPORT", from.ifBlank { "All dates" }, to.ifBlank { "All dates" }, lines, "${title.uppercase(Locale.getDefault())} REPORT")
    }

    fun csv(rows: List<Map<String, Any?>>): String {
        val columns = rows.flatMap { it.keys }.distinct()
        if (columns.isEmpty()) return ""
        fun escape(value: String): String = "\"${value.replace("\"", "\"\"")}\""
        return buildString {
            append(columns.joinToString(",", transform = ::escape)).append("\r\n")
            rows.forEach { row ->
                append(columns.joinToString(",") { key -> escape(row[key]?.toString().orEmpty()) }).append("\r\n")
            }
        }
    }
}
