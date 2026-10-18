package com.aashray.hospitality.ui.operations

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.AppSettingsDto
import com.aashray.hospitality.data.DepositRequest
import com.aashray.hospitality.data.UtilityRequest
import com.aashray.hospitality.data.UserDto
import com.aashray.hospitality.ui.OperationsViewModel
import com.aashray.hospitality.ui.finance.SelectionField
import com.aashray.hospitality.ui.money
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

data class ToolLink(val title: String, val subtitle: String, val permissions: Set<String>, val route: String)
val toolLinks = listOf(
    ToolLink("Utility billing", "Create a utility charge after reviewing its details.", setOf("utilities:write", "residents:read"), "utilities"),
    ToolLink("Due reminders", "Prepare a reminder and open WhatsApp for manual sending.", setOf("messages:send", "residents:read"), "reminders"),
    ToolLink("Security deposits", "Review the deposit ledger and record a receipt or refund.", setOf("payments:write", "residents:read"), "deposits"),
    ToolLink("Reports", "View live reports provided by the Aashray backend.", setOf("reports:read"), "reports"),
    ToolLink("Settings", "Review and update workspace settings.", setOf("settings:read"), "settings"),
)

@Composable
fun OperationsHomeScreen(user: UserDto, onOpen: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Workspace", "Operations", "Daily tools for utilities, reminders, deposits, reports, and settings.") }
        val available = toolLinks.filter { link -> link.permissions.all(user::can) }
        if (available.isEmpty()) item { com.aashray.hospitality.ui.EmptyContent("No tools assigned", "Ask your Aashray administrator to grant access to workspace tools.") }
        items(available) { link ->
            Card(modifier = Modifier.fillMaxWidth().clickable { onOpen(link.route) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(link.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(link.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun UtilitiesScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var residentId by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("ELECTRICITY") }
    var period by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString().take(7)) }
    var amount by rememberSaveable { mutableStateOf("") }
    var issuedAt by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var dueAt by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(7).toString()) }
    var notes by rememberSaveable { mutableStateOf("") }
    var key by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    val selected = state.residents.firstOrNull { it._id == residentId }
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    LaunchedEffect(Unit) { viewModel.loadResidents() }
    LaunchedEffect(state.busy, state.notice) { if (!state.busy && state.notice?.startsWith("Utility charge saved") == true) { key = UUID.randomUUID().toString(); amount = ""; notes = "" } }
    if (confirm) AlertDialog(
        onDismissRequest = { if (!state.busy) confirm = false },
        title = { Text("Create this utility charge?") },
        text = { Text("${selected?.fullName} · $type · $period · ${money((amountValue * 100).toLong())}, due $dueAt. The backend will create the charge.") },
        confirmButton = { Button(onClick = { confirm = false; viewModel.addUtility(UtilityRequest(residentId, utilityType = type, periodKey = period, amount = amountValue, issuedAt = issuedAt, dueAt = dueAt, notes = notes.trim(), idempotencyKey = key)) }, enabled = !state.busy) { Text("Confirm charge") } },
        dismissButton = { TextButton(onClick = { confirm = false }, enabled = !state.busy) { Text("Cancel") } },
    )
    ToolPage("Utility billing", "Create a one-time utility charge in the server ledger.", state.error, state.notice) {
        SelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId}" }, { residentId = it }, "Choose resident")
        OutlinedTextField(type, { type = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Utility type") }, singleLine = true)
        OutlinedTextField(period, { period = it.take(7) }, Modifier.fillMaxWidth(), label = { Text("Billing period (YYYY-MM)") }, singleLine = true)
        OutlinedTextField(amount, { amount = it.filter { ch -> ch.isDigit() || ch == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
        OutlinedTextField(issuedAt, { issuedAt = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Issued date (YYYY-MM-DD)") }, singleLine = true)
        OutlinedTextField(dueAt, { dueAt = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Due date (YYYY-MM-DD)") }, singleLine = true)
        OutlinedTextField(notes, { notes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
        Button(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy && selected != null && type.trim().length >= 2 && period.matches(Regex("\\d{4}-(0[1-9]|1[0-2])")) && amountValue > 0 && issuedAt.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && dueAt.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Review and create charge") }
    }
}

@Composable
fun RemindersScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var residentId by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("RENT_REMINDER") }
    var custom by rememberSaveable { mutableStateOf("") }
    val resultLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        state.preparedMessage?.message?._id?.let(viewModel::markMessageOpened)
    }
    LaunchedEffect(Unit) { viewModel.loadResidents(); viewModel.loadMessages() }
    ToolPage("Due reminders", "Prepare a resident-specific reminder. WhatsApp opens with the text prefilled; a staff member must review and send it.", state.error, state.notice) {
        SelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId}" }, { residentId = it; viewModel.clearPrepared() }, "Choose resident")
        SelectionField("Reminder type", kind, listOf("RENT_REMINDER" to "Rent reminder", "OVERDUE" to "Overdue rent", "UTILITY" to "Utility due", "CUSTOM" to "Custom message"), { kind = it; viewModel.clearPrepared() })
        if (kind == "CUSTOM") OutlinedTextField(custom, { custom = it.take(4000); viewModel.clearPrepared() }, Modifier.fillMaxWidth(), label = { Text("Message") }, minLines = 4)
        Button(onClick = { viewModel.prepareMessage(residentId, kind, custom) }, enabled = !state.messageBusy && residentId.isNotBlank() && (kind != "CUSTOM" || custom.isNotBlank()), modifier = Modifier.fillMaxWidth()) { if (state.messageBusy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Prepare preview") }
        state.preparedMessage?.let { prepared ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Review message", fontWeight = FontWeight.Bold)
                    Text(prepared.message?.message.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    Button(onClick = { runCatching { resultLauncher.launch(Intent(Intent.ACTION_VIEW, Uri.parse(prepared.whatsappUrl))) }.onFailure { /* visible platform apps decide whether WhatsApp is available */ } }, enabled = prepared.whatsappUrl.startsWith("https://wa.me/"), modifier = Modifier.fillMaxWidth()) { Text("Open WhatsApp to review") }
                }
            }
        }
        androidx.compose.material3.HorizontalDivider()
        Text("Recent reminders", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (state.messages.isEmpty()) Text("No prepared reminders in this workspace yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.messages.take(25).forEach { message ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${message.resident?.fullName ?: message.recipient} · ${message.messageType.replace('_', ' ')}", fontWeight = FontWeight.SemiBold)
                    Text(message.status.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(message.message, maxLines = 3, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun ReportsScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("occupancy") }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    ToolPage("Reports", "Read live operational and financial reports from the backend.", state.error, null) {
        SelectionField("Report", name, listOf("residents", "occupancy", "rent", "overdue", "collections", "outstanding", "utilities", "admissions").map { it to it.replaceFirstChar { char -> char.uppercase() } }, { name = it })
        OutlinedTextField(from, { from = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("From date (optional, YYYY-MM-DD)") }, singleLine = true)
        OutlinedTextField(to, { to = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("To date (optional, YYYY-MM-DD)") }, singleLine = true)
        Button(onClick = { viewModel.loadReport(name, from.takeIf(String::isNotBlank), to.takeIf(String::isNotBlank)) }, enabled = !state.busy && (from.isBlank() || from.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) && (to.isBlank() || to.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))), modifier = Modifier.fillMaxWidth()) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Load report") }
        state.report?.let { report ->
            Text("${report.rows.size} rows", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (report.rows.isEmpty()) Text("No records match this report and date range.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            report.rows.take(200).forEachIndexed { index, row ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text((row["name"] ?: row["resident"] ?: row["roomNumber"] ?: "Record ${index + 1}").toString(), fontWeight = FontWeight.SemiBold)
                        row.filterKeys { it !in setOf("name", "resident", "_id", "__v") }.entries.forEach { (key, value) ->
                            Text("${key.replace('_', ' ').replaceFirstChar(Char::uppercase)}: ${value ?: "—"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsScreen(canEdit: Boolean, viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var methods by rememberSaveable { mutableStateOf("CASH, BANK_TRANSFER, UPI, OTHER") }
    var utilities by rememberSaveable { mutableStateOf("ELECTRICITY, AC, OTHER") }
    var rentReminderTemplate by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { viewModel.loadSettings() }
    LaunchedEffect(state.settings) { state.settings?.let { name = it.businessName; phone = it.contactPhone; email = it.contactEmail; methods = it.paymentMethods.joinToString(", "); utilities = it.utilityTypes.joinToString(", "); rentReminderTemplate = it.rentReminderTemplate } }
    ToolPage("Settings", "Business settings are stored by the existing backend.", state.error, state.notice) {
        state.settings?.let { settings ->
            OutlinedTextField(name, { name = it.take(160) }, Modifier.fillMaxWidth(), label = { Text("Business name") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(phone, { phone = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Contact phone") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(email, { email = it.take(254) }, Modifier.fillMaxWidth(), label = { Text("Contact email") }, singleLine = true, readOnly = !canEdit)
            OutlinedTextField(methods, { methods = it.take(200) }, Modifier.fillMaxWidth(), label = { Text("Payment methods (comma separated)") }, minLines = 2, readOnly = !canEdit)
            OutlinedTextField(utilities, { utilities = it.take(300) }, Modifier.fillMaxWidth(), label = { Text("Utility types (comma separated)") }, minLines = 2, readOnly = !canEdit)
            Text("Rent and overdue reminder template", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(rentReminderTemplate, { rentReminderTemplate = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("WhatsApp message") }, minLines = 4, maxLines = 8, readOnly = !canEdit, supportingText = { Text("Available fields: {residentName}, {amount}, {month}, {dueDate}, {property}") })
            Text("Automatic WhatsApp delivery remains disabled. Reminders are opened for staff review and manual sending.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (canEdit) Button(onClick = {
                val validMethods = methods.split(',').map(String::trim).filter(String::isNotBlank).map(String::uppercase).distinct()
                val validUtilities = utilities.split(',').map(String::trim).filter(String::isNotBlank).distinct()
                viewModel.saveSettings(settings.copy(businessName = name.trim(), contactPhone = phone.trim(), contactEmail = email.trim(), timezone = "Asia/Kolkata", paymentMethods = validMethods, utilityTypes = validUtilities, rentReminderTemplate = rentReminderTemplate.trim(), whatsappAutoRemindersEnabled = false))
            }, enabled = !state.busy && name.trim().length >= 2 && rentReminderTemplate.trim().length >= 20 && (email.isBlank() || android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()), modifier = Modifier.fillMaxWidth()) { if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp); Text("Save settings") }
        } ?: if (state.busy) CircularProgressIndicator() else Text("Settings unavailable.")
    }
}

@Composable
fun DepositsScreen(viewModel: OperationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var residentId by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("RECEIVED") }
    var method by rememberSaveable { mutableStateOf("CASH") }
    var reference by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var key by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    val profile = state.depositProfile
    val balance = profile?.depositBalancePaise ?: 0L
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    LaunchedEffect(Unit) { viewModel.loadResidents() }
    LaunchedEffect(state.busy, state.notice) { if (!state.busy && state.notice?.startsWith("Deposit ledger updated") == true) { key = UUID.randomUUID().toString(); amount = ""; reference = ""; reason = "" } }
    if (confirm) AlertDialog(
        onDismissRequest = { if (!state.busy) confirm = false },
        title = { Text(if (kind == "RECEIVED") "Record deposit received?" else "Record deposit refund?") },
        text = { Text("${profile?.resident?.fullName} · ${money((amountValue * 100).toLong())} · ${method.replace('_', ' ')}. Current held deposit: ${money(balance)}. Reason: $reason") },
        confirmButton = { Button(onClick = { confirm = false; viewModel.recordDeposit(DepositRequest(residentId, amountValue, kind, method, reference.trim(), reason.trim(), key)) }, enabled = !state.busy) { Text("Confirm ledger entry") } },
        dismissButton = { TextButton(onClick = { confirm = false }, enabled = !state.busy) { Text("Cancel") } },
    )
    ToolPage("Security deposits", "Review the backend deposit ledger. Refunds cannot exceed the held balance.", state.error, state.notice) {
        SelectionField("Resident", residentId, state.residents.map { it._id to "${it.fullName} · ${it.residentId}" }, { residentId = it; viewModel.loadDepositProfile(it) }, "Choose resident")
        profile?.let { data ->
            Text("Held deposit: ${money(data.depositBalancePaise)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            SelectionField("Entry", kind, listOf("RECEIVED" to "Deposit received", "REFUNDED" to "Deposit refunded"), { kind = it })
            OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            SelectionField("Method", method, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { method = it })
            OutlinedTextField(reference, { reference = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Reference (optional)") }, singleLine = true)
            OutlinedTextField(reason, { reason = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Reason (required)") }, minLines = 2)
            Button(onClick = { confirm = true }, enabled = !state.busy && amountValue > 0 && reason.trim().length >= 5 && (kind != "REFUNDED" || (amountValue * 100).toLong() <= balance), modifier = Modifier.fillMaxWidth()) { Text("Review deposit entry") }
            Text("Deposit history", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (data.deposits.isEmpty()) Text("No deposit transactions are recorded.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            data.deposits.forEach { entry ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(entry.kind, fontWeight = FontWeight.SemiBold)
                            Text("${entry.createdAt?.take(10).orEmpty()} · ${entry.paymentMethod.replace('_', ' ')}", style = MaterialTheme.typography.bodySmall)
                            Text(entry.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(money(entry.amountPaise), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolPage(title: String, description: String, error: String?, notice: String?, content: @Composable ColumnScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Operations", title, description) }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        notice?.let { item { Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) { Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) } } }
        item { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) } }
    }
}
