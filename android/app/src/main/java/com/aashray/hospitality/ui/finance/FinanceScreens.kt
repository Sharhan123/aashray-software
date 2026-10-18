package com.aashray.hospitality.ui.finance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.BillingGenerationResponse
import com.aashray.hospitality.data.NewPaymentAllocation
import com.aashray.hospitality.data.NewPaymentRequest
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
                    SelectionField("Property (optional)", selectedProperty, state.properties.map { it._id to it.name }, { selectedProperty = it; result = null; viewModel.invalidatePreview() }, "All properties")
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
    }
}

@Composable
fun PaymentsScreen(onOpenReceipt: (String) -> Unit, viewModel: PaymentsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var residentSearch by rememberSaveable { mutableStateOf("") }
    var residentMenu by remember { mutableStateOf(false) }
    var amount by rememberSaveable { mutableStateOf("") }
    var allocation by rememberSaveable { mutableStateOf("") }
    var selectedCharge by rememberSaveable { mutableStateOf("") }
    var method by rememberSaveable { mutableStateOf("CASH") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var reference by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var submissionKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirm by remember { mutableStateOf(false) }
    val selectedResident = state.residents.firstOrNull { it._id == state.selectedResidentId }
    val pickedCharge = state.charges.firstOrNull { it._id == selectedCharge }
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    val allocationValue = allocation.toDoubleOrNull() ?: 0.0

    LaunchedEffect(state.message, state.busy) {
        if (!state.busy && state.message != null) {
            submissionKey = UUID.randomUUID().toString()
            amount = ""
            allocation = ""
            selectedCharge = ""
            reference = ""
            notes = ""
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

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Finance", "Payments", "Record receipts with optional charge allocation. Payment balances and receipt numbers come from the server.") }
        state.error?.let { item { ErrorBanner(it) } }
        state.message?.let { item { SuccessBanner(it) } }
        state.receiptId?.let { paymentId -> item { OutlinedButton(onClick = { onOpenReceipt(paymentId) }, modifier = Modifier.fillMaxWidth()) { Text("Open saved receipt") } } }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = residentSearch.ifBlank { selectedResident?.let { "${it.fullName} · ${it.residentId}" }.orEmpty() },
                        onValueChange = { residentSearch = it; residentMenu = true }, modifier = Modifier.fillMaxWidth(), label = { Text("Resident") }, singleLine = true,
                    )
                    DropdownMenu(expanded = residentMenu, onDismissRequest = { residentMenu = false }) {
                        state.residents.filter { it.fullName.contains(residentSearch, true) || it.residentId.contains(residentSearch, true) || it.mobile.contains(residentSearch, true) }.take(30).forEach { resident ->
                            DropdownMenuItem(text = { Text("${resident.fullName} · ${resident.residentId}") }, onClick = { viewModel.selectResident(resident._id); residentSearch = ""; residentMenu = false; selectedCharge = ""; allocation = "" })
                        }
                    }
                    if (state.loading) CircularProgressIndicator()
                    OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount received (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                    SelectionField("Payment method", method, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { method = it })
                    OutlinedTextField(date, { date = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Payment date (YYYY-MM-DD)") }, singleLine = true)
                    OutlinedTextField(reference, { reference = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Reference (optional)") }, singleLine = true)
                    OutlinedTextField(notes, { notes = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 2)
                    if (selectedResident != null) {
                        if (state.charges.isNotEmpty()) {
                            SelectionField("Allocate to outstanding charge (optional)", selectedCharge, state.charges.map { it._id to "${it.description} · ${money(it.balancePaise)}" }, { id -> selectedCharge = id; allocation = state.charges.firstOrNull { it._id == id }?.balancePaise?.let { (it / 100.0).toString() }.orEmpty() }, "Leave unallocated")
                            if (pickedCharge != null) OutlinedTextField(allocation, { allocation = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Amount to allocate (₹), max ${money(pickedCharge.balancePaise)}") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                        } else state.chargeError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Button(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy && selectedResident != null && amountValue > 0 && date.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && (pickedCharge == null || allocationValue > 0 && allocationValue <= amountValue && allocationValue * 100 <= pickedCharge.balancePaise)) {
                        if (state.busy) CircularProgressIndicator(Modifier.padding(end = 10.dp), strokeWidth = 2.dp)
                        Text(if (state.busy) "Recording payment…" else "Record payment")
                    }
                }
            }
        }
        item { SectionTitle("Payment history", "${state.payments.size} saved payments") }
        if (!state.loading && state.payments.isEmpty()) item { com.aashray.hospitality.ui.EmptyContent("No payments yet", "Saved payment records from the backend will appear here.") }
        items(state.payments, key = { it._id }) { payment ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(payment.residentId?.fullName ?: "Resident", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text("${payment.residentId?.residentId.orEmpty()} · ${payment.paymentDate?.take(10).orEmpty()} · ${payment.method}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(money(payment.amountPaise), fontWeight = FontWeight.Bold)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${payment.allocationStatus.replace('_', ' ')} · ${money(payment.unallocatedPaise)} unallocated", style = MaterialTheme.typography.labelSmall)
                        TextButton(onClick = { onOpenReceipt(payment._id) }, enabled = payment._id.isNotBlank()) { Text("Receipt") }
                    }
                }
            }
        }
        item { OutlinedButton(onClick = viewModel::refresh, modifier = Modifier.fillMaxWidth(), enabled = !state.loading) { Text("Refresh payment history") } }
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
