package com.aashray.hospitality.ui.residents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.AllocationDto
import com.aashray.hospitality.data.CheckoutRequest
import com.aashray.hospitality.data.CheckoutRefundRequest
import com.aashray.hospitality.data.CheckoutSummaryDto
import com.aashray.hospitality.data.ReadmitRequest
import com.aashray.hospitality.ui.finance.SelectionField
import com.aashray.hospitality.ui.finance.StatementLine
import com.aashray.hospitality.ui.finance.StatementPdf
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.MetricCard
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.ResidentProfileViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.dateLabel
import com.aashray.hospitality.ui.money
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ResidentProfileScreen(canEdit: Boolean = false, canCheckout: Boolean = false, canRefund: Boolean = false, onEditResident: (String) -> Unit = {}, viewModel: ResidentProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val checkoutBusy by viewModel.checkoutBusy.collectAsStateWithLifecycle()
    val checkoutMessage by viewModel.checkoutMessage.collectAsStateWithLifecycle()
    val readmitProperties by viewModel.readmitProperties.collectAsStateWithLifecycle()
    val readmitRooms by viewModel.readmitRooms.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var showCheckout by remember { mutableStateOf(false) }
    var showReadmit by remember { mutableStateOf(false) }
    var refundTarget by remember { mutableStateOf<CheckoutSummaryDto?>(null) }
    var refundAmount by remember { mutableStateOf("") }
    var refundMethod by remember { mutableStateOf("CASH") }
    var refundReference by remember { mutableStateOf("") }
    var refundReason by remember { mutableStateOf("") }
    var readmitPropertyId by remember { mutableStateOf("") }
    var readmitRoomId by remember { mutableStateOf("") }
    var readmitBedId by remember { mutableStateOf("") }
    var readmitDate by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var readmitRent by remember { mutableStateOf("") }
    var statementFrom by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).withDayOfMonth(1).toString()) }
    var statementTo by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var statementBusy by remember { mutableStateOf(false) }
    var statementMessage by remember { mutableStateOf<String?>(null) }
    var checkoutDate by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()) }
    var checkoutReason by remember { mutableStateOf("Resident checkout") }
    var extraDays by remember { mutableStateOf("0") }
    var dailyRate by remember { mutableStateOf("") }
    val dayCount = extraDays.toIntOrNull() ?: 0
    val dayRateRupees = dailyRate.toDoubleOrNull() ?: 0.0
    val selectedReadmitRoom = readmitRooms.firstOrNull { it._id == readmitRoomId }
    val occupiedReadmitBeds = selectedReadmitRoom?.occupiedBeds.orEmpty()
    val vacantBedIds = selectedReadmitRoom?.beds.orEmpty().filter { it.active && it.bedId !in occupiedReadmitBeds }.map { it.bedId }
    if (showReadmit) AlertDialog(
        onDismissRequest = { if (!checkoutBusy) showReadmit = false },
        title = { Text("Re-admit resident") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("This creates a new room allocation and rent schedule. Previous checkout and ledger history remains saved.", style = MaterialTheme.typography.bodySmall)
                SelectionField("Property", readmitPropertyId, readmitProperties.map { it._id to it.name }, { readmitPropertyId = it; readmitRoomId = ""; readmitBedId = ""; viewModel.loadReadmitRooms(it) }, "Choose property")
                SelectionField("Available room", readmitRoomId, readmitRooms.map { it._id to "${it.roomNumber} · ${it.propertyName.orEmpty()} · ${it.available} vacant" }, { readmitRoomId = it; readmitBedId = "" }, "Choose room")
                if (selectedReadmitRoom != null) SelectionField("Available bed", readmitBedId, vacantBedIds.map { it to "Bed $it" }, { readmitBedId = it }, "Choose bed")
                OutlinedTextField(readmitDate, { readmitDate = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Admission date (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(readmitRent, { readmitRent = it.filter { char -> char.isDigit() || char == '.' } }, Modifier.fillMaxWidth(), label = { Text("Monthly rent (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            }
        },
        confirmButton = { Button(onClick = {
            showReadmit = false
            viewModel.readmit(ReadmitRequest(readmitPropertyId, readmitRoomId, readmitBedId, readmitDate, readmitRent.toDoubleOrNull() ?: 0.0, UUID.randomUUID().toString()))
        }, enabled = !checkoutBusy && readmitPropertyId.isNotBlank() && readmitRoomId.isNotBlank() && readmitBedId.isNotBlank() && readmitDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && (readmitRent.toDoubleOrNull() ?: 0.0) > 0) { Text(if (checkoutBusy) "Saving…" else "Confirm re-admission") } },
        dismissButton = { TextButton(onClick = { showReadmit = false }, enabled = !checkoutBusy) { Text("Cancel") } },
    )
    if (showCheckout) AlertDialog(
        onDismissRequest = { if (!checkoutBusy) showCheckout = false },
        title = { Text("Review checkout settlement") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Any unpaid rent for the current billing cycle is cancelled on checkout. Extra stay charges are calculated per day and applied against the held deposit automatically.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(checkoutDate, { checkoutDate = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Checkout date (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(checkoutReason, { checkoutReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Reason / notes") }, minLines = 2)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(extraDays, { extraDays = it.filter(Char::isDigit).take(2) }, Modifier.weight(1f), label = { Text("Extra days") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(dailyRate, { dailyRate = it.filter { char -> char.isDigit() || char == '.' } }, Modifier.weight(1f), label = { Text("Per day (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                }
                Text("Extra stay: ${money((dayCount * dayRateRupees * 100).toLong())} · Deposit held: ${money((state as? LoadState.Ready)?.value?.depositBalancePaise ?: 0)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text("This records the settlement and cancels the eligible unpaid cycle bill. It does not issue a refund automatically.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = {
                showCheckout = false
                viewModel.checkout(CheckoutRequest(
                    effectiveEndDate = checkoutDate,
                    reason = checkoutReason.trim(),
                    extraDays = dayCount,
                    perDayRatePaise = (dayRateRupees * 100).toLong(),
                    idempotencyKey = UUID.randomUUID().toString(),
                ))
            }, enabled = !checkoutBusy && checkoutDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && checkoutReason.trim().length >= 5 && dayCount >= 0 && (dayCount == 0 || dayRateRupees > 0)) { Text("Confirm checkout") }
        },
        dismissButton = { TextButton(onClick = { showCheckout = false }, enabled = !checkoutBusy) { Text("Cancel") } },
    )
    refundTarget?.let { checkout ->
        val refundValue = refundAmount.toDoubleOrNull() ?: 0.0
        AlertDialog(
            onDismissRequest = { if (!checkoutBusy) refundTarget = null },
            title = { Text("Record deposit refund") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Refundable deposit remaining: ${money(checkout.refundableRemainingPaise)}. Refunds are available 21 days after checkout.", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(refundAmount, { refundAmount = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("Refund amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                    SelectionField("Refund method", refundMethod, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { refundMethod = it })
                    OutlinedTextField(refundReference, { refundReference = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Reference (optional)") }, singleLine = true)
                    OutlinedTextField(refundReason, { refundReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Reason (required)") }, minLines = 2)
                }
            },
            confirmButton = { Button(onClick = {
                viewModel.refundCheckout(checkout._id, CheckoutRefundRequest(refundValue, refundMethod, refundReference.trim(), refundReason.trim(), UUID.randomUUID().toString()))
                refundTarget = null
                refundAmount = ""
                refundReference = ""
                refundReason = ""
            }, enabled = !checkoutBusy && refundValue > 0 && refundValue * 100 <= checkout.refundableRemainingPaise && refundReason.trim().length >= 5) { Text(if (checkoutBusy) "Saving…" else "Confirm refund") } },
            dismissButton = { TextButton(onClick = { refundTarget = null }, enabled = !checkoutBusy) { Text("Cancel") } },
        )
    }
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val profile = current.value
                val resident = profile.resident
                if (resident == null) item { EmptyContent("Resident not found", "This resident record is unavailable.") }
                else {
                    val statementRows = buildList {
                        profile.charges.forEach { charge ->
                            val date = (charge.issuedAt ?: charge.dueAt).orEmpty().take(10)
                            if (date >= statementFrom && date <= statementTo) add(StatementLine(date, "CHARGE · ${charge.kind.replace('_', ' ')}", charge.description.ifBlank { charge.periodKey }, "—", money(charge.amountPaise), "Balance ${money(charge.balancePaise)} · Due ${charge.dueAt?.take(10).orEmpty()}"))
                        }
                        profile.payments.forEach { payment ->
                            val date = payment.paymentDate.orEmpty().take(10)
                            if (date >= statementFrom && date <= statementTo) add(StatementLine(date, if (payment.reversedAt == null) "PAYMENT RECEIVED" else "PAYMENT REVERSED", payment.reference.ifBlank { payment.allocationStatus.replace('_', ' ') }, payment.method.replace('_', ' '), money(payment.amountPaise), payment.notes))
                        }
                        profile.deposits.forEach { deposit ->
                            val date = deposit.createdAt.orEmpty().take(10)
                            if (date >= statementFrom && date <= statementTo) add(StatementLine(date, "DEPOSIT · ${deposit.kind}", deposit.reason.ifBlank { deposit.reference }, deposit.paymentMethod.replace('_', ' '), money(deposit.amountPaise)))
                        }
                    }.sortedByDescending { it.date }
                    item { PageIntro("Resident record", resident.fullName, "${resident.residentId} · ${resident.status}") }
                    if (checkoutMessage != null) item { Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) { Text(checkoutMessage.orEmpty(), Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) } }
                    if (canEdit) item { Button(onClick = { onEditResident(resident._id) }, modifier = Modifier.fillMaxWidth()) { Text("Edit resident") } }
                    if (canCheckout && resident.status in setOf("ACTIVE", "NOTICE")) item { Button(onClick = { showCheckout = true }, modifier = Modifier.fillMaxWidth(), enabled = !checkoutBusy) { Text(if (checkoutBusy) "Saving checkout…" else "Start checkout") } }
                    if (canEdit && resident.status == "INACTIVE") item { Button(onClick = { readmitRent = (resident.currentRentPaise / 100.0).toString(); showReadmit = true; viewModel.loadReadmitProperties() }, modifier = Modifier.fillMaxWidth(), enabled = !checkoutBusy) { Text("Re-admit resident") } }
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Resident details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                ProfileRow("Mobile", resident.mobile)
                                if (resident.email.isNotBlank()) ProfileRow("Email", resident.email)
                                ProfileRow("Admitted", dateLabel(resident.admissionDate))
                                ProfileRow("Billing starts", dateLabel(resident.billingStartDate))
                                ProfileRow("Current room", resident.currentAllocation?.roomId?.roomNumber ?: resident.currentAllocation?.roomNumber ?: "—")
                                ProfileRow("Bed", resident.currentAllocation?.bedId ?: "—")
                                ProfileRow("Current monthly rent", money(resident.currentRentPaise))
                            }
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricCard("Outstanding", money(profile.outstandingPaise), "Server balance", Modifier.weight(1f))
                            MetricCard("Overdue", money(profile.overduePaise), "Past due rent", Modifier.weight(1f))
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricCard("Pending utilities", money(profile.pendingUtilityPaise), "Unpaid charges", Modifier.weight(1f))
                            MetricCard("Security deposit", money(profile.depositBalancePaise), "Ledger balance", Modifier.weight(1f))
                        }
                    }
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Transaction statement", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text("Review this resident’s charges, payments, and deposit ledger for a selected date range.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(statementFrom, { statementFrom = it.take(10) }, Modifier.weight(1f), label = { Text("From · YYYY-MM-DD") }, singleLine = true)
                                    OutlinedTextField(statementTo, { statementTo = it.take(10) }, Modifier.weight(1f), label = { Text("To · YYYY-MM-DD") }, singleLine = true)
                                }
                                Text("${statementRows.size} transactions in range", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                Button(onClick = {
                                    statementBusy = true; statementMessage = null
                                    scope.launch {
                                        runCatching { withContext(Dispatchers.IO) { StatementPdf.create(context, resident.fullName, resident.residentId, statementFrom, statementTo, statementRows) } }
                                            .onSuccess { file -> runCatching { StatementPdf.share(context, file) }.onFailure { statementMessage = it.message ?: "Could not open share options." } }
                                            .onFailure { statementMessage = it.message ?: "Could not create the statement PDF." }
                                        statementBusy = false
                                    }
                                }, modifier = Modifier.fillMaxWidth(), enabled = !statementBusy && statementFrom.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && statementTo.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && statementFrom <= statementTo) {
                                    Text(if (statementBusy) "Preparing statement…" else "Download / share statement PDF")
                                }
                                statementMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                                statementRows.take(8).forEach { row ->
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Column(Modifier.weight(1f)) {
                                            Text(row.category, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                            Text("${row.date} · ${row.detail}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Text(row.amount, fontWeight = FontWeight.Bold)
                                    }
                                }
                                if (statementRows.isEmpty()) Text("No transactions in this date range.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    item { SectionTitle("Checkout settlements", "${profile.checkouts.size} records") }
                    if (profile.checkouts.isEmpty()) item { EmptyContent("No checkout history", "Checkout summaries and refundable deposit balances will appear here.") }
                    items(profile.checkouts, key = { "checkout-${it._id}" }) { checkout ->
                        val refundAvailableDate = runCatching { LocalDate.parse(checkout.checkoutDate?.take(10)).plusDays(21) }.getOrNull()
                        val refundEligible = refundAvailableDate?.let { !LocalDate.now(ZoneId.of("Asia/Kolkata")).isBefore(it) } == true
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                Text("Checkout · ${dateLabel(checkout.checkoutDate)}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(listOf(checkout.propertyName, checkout.roomNumber.takeIf(String::isNotBlank)?.let { "Room $it" }, checkout.bedId.takeIf(String::isNotBlank)?.let { "Bed $it" }).filterNotNull().filter(String::isNotBlank).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                ProfileRow("Refundable deposit", money(checkout.refundableRemainingPaise))
                                ProfileRow("Refunded so far", money(checkout.refundedToDatePaise))
                                Text(checkout.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (checkout.refundableRemainingPaise > 0) {
                                    if (refundEligible) Button(onClick = { refundTarget = checkout; refundAmount = (checkout.refundableRemainingPaise / 100.0).toString() }, modifier = Modifier.fillMaxWidth(), enabled = canRefund && !checkoutBusy) { Text("Record deposit refund") }
                                    else Text("Refund available from ${refundAvailableDate?.let { dateLabel(it.toString()) } ?: "21 days after checkout"}.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                    item { SectionTitle("Room allocation history", "${profile.allocations.size} entries") }
                    if (profile.allocations.isEmpty()) item { EmptyContent("No allocation history", "There are no room assignments in this resident record.") }
                    items(profile.allocations) { allocation -> AllocationCard(allocation) }
                }
            }
        }
    }
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun AllocationCard(allocation: AllocationDto) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Room ${allocation.roomId?.roomNumber ?: allocation.roomNumber ?: "—"} · Bed ${allocation.bedId ?: "—"}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text("${dateLabel(allocation.startDate)} to ${allocation.endDate?.let(::dateLabel) ?: "Current"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
