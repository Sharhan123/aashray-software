package com.aashray.hospitality.ui.finance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.BillingGenerationResponse
import com.aashray.hospitality.data.NewPaymentAllocation
import com.aashray.hospitality.data.NewPaymentRequest
import com.aashray.hospitality.data.PaymentLedgerRowDto
import com.aashray.hospitality.ui.BillingViewModel
import com.aashray.hospitality.ui.PaymentsViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.money
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@Composable
fun RentBillingScreen(viewModel: BillingViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var period by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString().take(7)) }
    var selectedProperty by rememberSaveable { mutableStateOf("") }
    var showConfirmation by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<BillingGenerationResponse?>(null) }

    if (showConfirmation) {
        val preview = state.preview
        AlertDialog(
            onDismissRequest = { if (!state.busy) showConfirmation = false },
            title = { Text("Generate rent for ${preview?.periodKey.orEmpty()}?") },
            text = { Text("The server will create ${preview?.summary?.newChargesToCreate ?: 0} eligible rent charges totaling ${money(preview?.summary?.totalAmountProposedPaise ?: 0)}. Existing charges will be skipped. This action writes to the financial ledger.") },
            confirmButton = { Button(onClick = { viewModel.generate { result = it }; showConfirmation = false }, enabled = !state.busy) { Text("Confirm and generate") } },
            dismissButton = { TextButton(onClick = { showConfirmation = false }, enabled = !state.busy) { Text("Cancel") } },
        )
    }

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Finance", "Rent & billing", "Preview eligible residents and server-calculated amounts before creating monthly charges.") }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(period, { period = it.take(7); result = null; viewModel.invalidatePreview() }, Modifier.fillMaxWidth(), label = { Text("Billing period (YYYY-MM)") }, singleLine = true)
                    SelectionField("Property (optional)", selectedProperty, state.properties.map { it._id to it.name }, { selectedProperty = it; result = null; viewModel.invalidatePreview(); viewModel.loadHistory(it.ifBlank { null }) }, "All properties")
                    Button(onClick = { result = null; viewModel.preview(period, selectedProperty.ifBlank { null }) }, enabled = !state.busy && period.matches(Regex("\\d{4}-(0[1-9]|1[0-2])")), modifier = Modifier.fillMaxWidth()) {
                        if (state.busy) CircularProgressIndicator(Modifier.padding(end = 10.dp), strokeWidth = 2.dp)
                        Text("Preview rent")
                    }
                    state.message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    result?.let { Text("Created ${it.created} charges (${money(it.createdPaise)}); skipped ${it.skipped}.", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
        state.preview?.let { preview ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SummaryChip("Eligible", preview.summary.eligibleResidents.toString())
                    SummaryChip("New charges", preview.summary.newChargesToCreate.toString())
                    SummaryChip("Proposed", money(preview.summary.totalAmountProposedPaise))
                }
            }
            item { SectionTitle("Preview", "${preview.candidates.size} residents") }
            items(preview.candidates, key = { it.residentRecordId }) { candidate ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(candidate.fullName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text(money(candidate.proposedPaise), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        }
                        Text("${candidate.residentId} · Room ${candidate.roomNumber.ifBlank { "—" }} · Bed ${candidate.bedId.ifBlank { "—" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!candidate.eligible || candidate.existing) Text(candidate.exclusionReason, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            item { Button(onClick = { showConfirmation = true }, enabled = !state.busy && preview.summary.newChargesToCreate > 0, modifier = Modifier.fillMaxWidth()) { Text("Generate ${preview.summary.newChargesToCreate} rent charges") } }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Rent billing history", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${state.charges.size} recent charges", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = { viewModel.loadHistory(selectedProperty.ifBlank { null }) }, enabled = !state.historyBusy) { Text(if (state.historyBusy) "Loading" else "Refresh") }
            }
        }
        if (state.charges.isEmpty() && !state.historyBusy) item { com.aashray.hospitality.ui.EmptyContent("No rent charges yet", "Generated rent charges for this workspace will appear here.") }
        items(state.charges, key = { it._id }) { charge ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(charge.residentId?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text(money(charge.amountPaise), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${charge.description} · ${charge.periodKey}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Due ${charge.dueAt?.take(10) ?: "—"} · ${charge.status.replace('_', ' ')} · ${money(charge.balancePaise)} outstanding", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun PaymentsScreen(onOpenReceipt: (String) -> Unit, viewModel: PaymentsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var amount by rememberSaveable { mutableStateOf("") }
    var allocation by rememberSaveable { mutableStateOf("") }
    var selectedCharge by rememberSaveable { mutableStateOf("") }
    var method by rememberSaveable { mutableStateOf("CASH") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var reference by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var submissionKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    var showPaymentForm by rememberSaveable { mutableStateOf(false) }
    var reverseTarget by rememberSaveable { mutableStateOf<com.aashray.hospitality.data.PaymentDto?>(null) }
    var reversalReason by rememberSaveable { mutableStateOf("") }
    var reportFrom by rememberSaveable { mutableStateOf("") }
    var reportTo by rememberSaveable { mutableStateOf("") }
    var reportMessage by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val selectedResident = state.residents.firstOrNull { it._id == state.selectedResidentId }
    val pickedCharge = state.charges.firstOrNull { it._id == selectedCharge }
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    val allocationValue = allocation.toDoubleOrNull() ?: 0.0

    LaunchedEffect(state.message, state.busy) {
        if (!state.busy && state.message != null) {
            showPaymentForm = false
            submissionKey = UUID.randomUUID().toString()
            amount = ""; allocation = ""; selectedCharge = ""; reference = ""; notes = ""
        }
    }

    if (confirm) AlertDialog(
        onDismissRequest = { if (!state.busy) confirm = false },
        title = { Text("Record this payment?") },
        text = { Text("Record ${money((amountValue * 100).toLong())} from ${selectedResident?.fullName.orEmpty()} on $date by $method${pickedCharge?.let { ". Allocate ${money((allocationValue * 100).toLong())} to ${it.description}." } ?: ". Leave it unallocated."} The backend will update the ledger and return the saved payment.") },
        confirmButton = { Button(onClick = {
            confirm = false
            viewModel.record(NewPaymentRequest(
                residentId = selectedResident?._id.orEmpty(), amount = amountValue, paymentDate = date, method = method,
                reference = reference.trim(), notes = notes.trim(),
                allocations = if (pickedCharge != null && allocationValue > 0) listOf(NewPaymentAllocation(pickedCharge._id, allocationValue)) else emptyList(),
                idempotencyKey = submissionKey,
            ))
        }, enabled = !state.busy) { Text("Confirm payment") } },
        dismissButton = { TextButton(onClick = { confirm = false }, enabled = !state.busy) { Text("Cancel") } },
    )

    reverseTarget?.let { payment ->
        AlertDialog(
            onDismissRequest = { if (!state.busy) { reverseTarget = null; reversalReason = "" } },
            title = { Text("Reverse payment?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("This restores allocated balances and keeps a reversal in the audit trail. This action cannot be undone.")
                    OutlinedTextField(reversalReason, { reversalReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Reason (required)") }, minLines = 2)
                }
            },
            confirmButton = { Button(onClick = { viewModel.reverse(payment._id, reversalReason); reverseTarget = null; reversalReason = "" }, enabled = !state.busy && reversalReason.trim().length >= 5) { Text("Reverse payment") } },
            dismissButton = { TextButton(onClick = { reverseTarget = null; reversalReason = "" }, enabled = !state.busy) { Text("Cancel") } },
        )
    }

    if (showPaymentForm) ModalBottomSheet(onDismissRequest = { if (!state.busy) showPaymentForm = false }) {
        Column(Modifier.fillMaxWidth().heightIn(max = 720.dp).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Record a payment", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("Choose a resident and review the allocation before saving.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SearchableSelectionField("Resident", state.selectedResidentId.orEmpty(), state.residents.map { it._id to "${it.fullName} · ${it.residentId} · ${it.mobile}" }, { viewModel.selectResident(it); selectedCharge = ""; allocation = "" })
            if (state.loading) CircularProgressIndicator()
            OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount received (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            SelectionField("Payment method", method, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { method = it })
            OutlinedTextField(date, { date = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Payment date (YYYY-MM-DD)") }, singleLine = true)
            OutlinedTextField(reference, { reference = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Reference (optional)") }, singleLine = true)
            OutlinedTextField(notes, { notes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
            if (selectedResident != null && state.charges.isNotEmpty()) {
                SelectionField("Allocate to outstanding charge (optional)", selectedCharge, state.charges.map { it._id to "${it.description} · ${money(it.balancePaise)}" }, { id -> selectedCharge = id; allocation = state.charges.firstOrNull { it._id == id }?.balancePaise?.let { (it / 100.0).toString() }.orEmpty() }, "Leave unallocated")
                if (pickedCharge != null) OutlinedTextField(allocation, { allocation = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount to allocate (₹), max ${money(pickedCharge.balancePaise)}") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            } else if (selectedResident != null) state.chargeError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { showPaymentForm = false }, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Cancel") }
                Button(onClick = { showPaymentForm = false; confirm = true }, modifier = Modifier.weight(1f), enabled = !state.busy && selectedResident != null && amountValue > 0 && date.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && (pickedCharge == null || allocationValue > 0 && allocationValue <= amountValue && allocationValue * 100 <= pickedCharge.balancePaise)) { Text("Review payment") }
            }
        }
    }

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Finance", "Payments", "Record receipts with optional charge allocation. Payment balances and receipt numbers come from the server.") }
        state.error?.let { item { ErrorBanner(it) } }
        state.message?.let { item { SuccessBanner(it) } }
        state.receiptId?.let { paymentId -> item { OutlinedButton(onClick = { onOpenReceipt(paymentId) }, modifier = Modifier.fillMaxWidth()) { Text("Open saved receipt") } } }
        item { Button(onClick = { showPaymentForm = true }, modifier = Modifier.fillMaxWidth()) { Text("Record payment") } }
        item { SectionTitle("Transaction ledger", "${state.ledgerRows.size} records · payments and deposits") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to "All activity", "rent" to "Rent", "utilities" to "Utility bills", "deposits" to "Deposits").forEach { (kind, label) ->
                        FilterChip(selected = state.ledgerKind == kind, onClick = { viewModel.loadLedger(kind, reportFrom, reportTo) }, label = { Text(label) })
                    }
                }
                OutlinedTextField(reportFrom, { reportFrom = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("From date (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(reportTo, { reportTo = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("To date (YYYY-MM-DD)") }, singleLine = true)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.loadLedger(state.ledgerKind, reportFrom, reportTo) }, modifier = Modifier.weight(1f), enabled = !state.ledgerLoading) { Text("Apply dates") }
                    Button(onClick = {
                        if ((reportFrom.isNotBlank() && !reportFrom.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) || (reportTo.isNotBlank() && !reportTo.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) || (reportFrom.isNotBlank() && reportTo.isNotBlank() && reportFrom > reportTo)) { reportMessage = "Enter valid dates and make sure the end date is on or after the start date."; return@Button }
                        runCatching {
                            val rows = state.ledgerRows.map { row -> StatementLine(row.date.orEmpty().take(10), row.type.replace('_', ' '), "${row.resident} · ${row.description.ifBlank { row.entry.ifBlank { row.reason } }} · ${row.reference}", row.method, money((row.amountRupees * 100).toLong()), row.notes.ifBlank { row.reason }) }
                            StatementPdf.create(context, "Payments & deposits", state.ledgerKind.uppercase(), reportFrom.ifBlank { "All dates" }, reportTo.ifBlank { "All dates" }, rows, "PAYMENTS & DEPOSITS REPORT").also { StatementPdf.share(context, it) }
                        }.onSuccess { reportMessage = "PDF report is ready to save or share." }.onFailure { reportMessage = it.message ?: "Could not create the PDF report." }
                    }, modifier = Modifier.weight(1f), enabled = !state.ledgerLoading) { Text("Generate PDF") }
                }
                reportMessage?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
                if (state.ledgerLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
                state.ledgerError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
        if (!state.ledgerLoading && state.ledgerRows.isEmpty()) item { com.aashray.hospitality.ui.EmptyContent("No ledger activity", "No payment or deposit records match these filters.") }
        items(state.ledgerRows, key = { it.id }) { row ->
            PaymentLedgerCard(row, onReceipt = { row.paymentId?.takeIf(String::isNotBlank)?.let(onOpenReceipt) }, onReverse = {
                row.paymentId?.takeIf(String::isNotBlank)?.let { id ->
                    reverseTarget = state.payments.firstOrNull { it._id == id } ?: com.aashray.hospitality.data.PaymentDto(
                        _id = id, residentId = com.aashray.hospitality.data.DueResidentDto(fullName = row.resident, residentId = row.residentCode),
                        amountPaise = row.amountPaise, paymentDate = row.date, method = row.method, reference = row.reference,
                        notes = row.notes, allocationStatus = row.allocationStatus,
                    )
                }
            })
        }
        item { OutlinedButton(onClick = { viewModel.refresh(); viewModel.loadLedger() }, modifier = Modifier.fillMaxWidth(), enabled = !state.loading && !state.ledgerLoading) { Text("Refresh transaction ledger") } }
    }
}

@Composable
private fun PaymentLedgerCard(row: PaymentLedgerRowDto, onReceipt: () -> Unit, onReverse: () -> Unit) {
    val deposit = row.type == "DEPOSIT"
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(row.resident, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text("${row.residentCode} · ${row.date?.take(10).orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(money((row.amountRupees * 100).toLong()), fontWeight = FontWeight.Bold)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${row.type.replace('_', ' ')} · ${row.method.ifBlank { "—" }}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(row.status.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = if (row.status == "REVERSED") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val details = listOf(row.description, row.entry, row.reason).firstOrNull(String::isNotBlank).orEmpty()
            if (details.isNotBlank()) Text(details, style = MaterialTheme.typography.bodySmall)
            if (row.reference.isNotBlank()) Text("Reference: ${row.reference}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (row.notes.isNotBlank()) Text("Notes: ${row.notes}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!deposit && row.paymentId != null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onReceipt) { Text("Receipt") }
                if (row.status != "REVERSED") TextButton(onClick = onReverse) { Text("Reverse") }
            }
        }
    }
}

@Composable
fun SelectionField(label: String, selected: String, values: List<Pair<String, String>>, onSelect: (String) -> Unit, emptyLabel: String? = null) {
    var expanded by remember { mutableStateOf(false) }
    val shown = values.firstOrNull { it.first == selected }?.second ?: if (selected.isBlank()) emptyLabel.orEmpty() else selected
    Column {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.fillMaxWidth()) {
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(shown.ifBlank { "Choose" }, style = MaterialTheme.typography.bodyMedium, color = if (selected.isBlank() && emptyLabel == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (emptyLabel != null) DropdownMenuItem(text = { Text(emptyLabel) }, onClick = { onSelect(""); expanded = false })
            values.forEach { (id, title) -> DropdownMenuItem(text = { Text(title) }, onClick = { onSelect(id); expanded = false }) }
        }
    }
}

@Composable
fun SearchableSelectionField(
    label: String,
    selected: String,
    values: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    emptyLabel: String = "Choose $label",
) {
    var expanded by remember { mutableStateOf(false) }
    var query by rememberSaveable(label) { mutableStateOf("") }
    val selectedLabel = values.firstOrNull { it.first == selected }?.second ?: ""
    val matches = values.filter { it.second.contains(query.trim(), ignoreCase = true) }
    OutlinedButton(onClick = { query = ""; expanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(selectedLabel.ifBlank { emptyLabel }, style = MaterialTheme.typography.bodyMedium, color = if (selected.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
        }
    }
    if (expanded) Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Card(
            modifier = Modifier.fillMaxWidth(0.94f).heightIn(max = 680.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Choose $label", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Search name or resident ID") }, singleLine = true)
                if (values.isEmpty()) Text("No residents are available.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (matches.isEmpty()) Text("No residents match this search.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(matches, key = { it.first }) { (id, title) ->
                        TextButton(onClick = { onSelect(id); expanded = false }, modifier = Modifier.fillMaxWidth()) {
                            Text(title, Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                TextButton(onClick = { expanded = false }, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
            }
        }
    }
}

@Composable
private fun SummaryChip(label: String, value: String) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall)
            Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ErrorBanner(message: String) = Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
    Text(message, Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun SuccessBanner(message: String) = Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
    Text(message, Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.bodySmall)
}
