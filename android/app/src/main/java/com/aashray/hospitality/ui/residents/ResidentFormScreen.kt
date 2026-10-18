package com.aashray.hospitality.ui.residents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.EditResidentRequest
import com.aashray.hospitality.data.NewResidentRequest
import com.aashray.hospitality.ui.ResidentFormViewModel
import com.aashray.hospitality.ui.finance.SelectionField
import com.aashray.hospitality.ui.money
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@Composable
fun ResidentFormScreen(
    onSaved: (String) -> Unit,
    onCancel: () -> Unit,
    viewModel: ResidentFormViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val edit = state.resident != null
    val today = remember { LocalDate.now(ZoneId.of("Asia/Kolkata")) }
    var name by rememberSaveable { mutableStateOf("") }
    var mobile by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var emergency by rememberSaveable { mutableStateOf("") }
    var governmentId by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var propertyId by rememberSaveable { mutableStateOf("") }
    var roomId by rememberSaveable { mutableStateOf("") }
    var bedId by rememberSaveable { mutableStateOf("") }
    var admissionDate by rememberSaveable { mutableStateOf(today.toString()) }
    var billingStart by rememberSaveable { mutableStateOf(today.withDayOfMonth(1).toString()) }
    var monthlyRent by rememberSaveable { mutableStateOf("") }
    var deposit by rememberSaveable { mutableStateOf("0") }
    var depositPaid by rememberSaveable { mutableStateOf("0") }
    var depositMethod by rememberSaveable { mutableStateOf("CASH") }
    var idempotencyKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var confirmation by remember { mutableStateOf(false) }
    val currentResident = state.resident
    val selectedRoom = state.rooms.firstOrNull { it._id == roomId }
    val rentValue = monthlyRent.toDoubleOrNull() ?: 0.0
    val depositValue = deposit.toDoubleOrNull() ?: 0.0
    val depositPaidValue = depositPaid.toDoubleOrNull() ?: 0.0

    LaunchedEffect(currentResident?._id) {
        currentResident?.let { resident ->
            name = resident.fullName; mobile = resident.mobile; email = resident.email
            emergency = resident.emergencyContact; governmentId = resident.governmentId; notes = resident.notes
            monthlyRent = (resident.rentSchedules.lastOrNull()?.monthlyRentPaise?.div(100.0) ?: resident.currentRentPaise / 100.0).toString()
            billingStart = today.plusMonths(1).withDayOfMonth(1).toString()
            admissionDate = resident.admissionDate?.take(10) ?: today.toString()
            bedId = resident.currentAllocation?.bedId.orEmpty()
        }
    }
    val billingDaySource = if (edit) currentResident?.admissionDate?.take(10) ?: admissionDate else admissionDate
    val dueDayValue = runCatching { LocalDate.parse(billingDaySource).dayOfMonth }.getOrDefault(0)
    LaunchedEffect(state.rooms, currentResident?._id) {
        val currentRoomNumber = currentResident?.currentAllocation?.roomId?.roomNumber ?: currentResident?.currentAllocation?.roomNumber
        val room = state.rooms.firstOrNull { it.roomNumber == currentRoomNumber }
        room?.let { roomId = it._id; propertyId = it.propertyId.orEmpty() }
    }
    LaunchedEffect(state.savedId) { state.savedId?.let(onSaved) }

    if (confirmation) AlertDialog(
        onDismissRequest = { if (!state.busy) confirmation = false },
        title = { Text(if (edit) "Save resident changes?" else "Admit this resident?") },
        text = { Text(if (edit) "Updates profile details now. Any changed rent or room assignment begins $billingStart; future rent is due on admission day $dueDayValue. Previous charges stay unchanged." else "This creates the resident, allocates room ${selectedRoom?.roomNumber} / bed $bedId, starts rent billing this month on admission day $dueDayValue for ${money((rentValue * 100).toLong())}, and records ${money((depositPaidValue * 100).toLong())} received toward the security deposit. No bills are created for months before the resident is added to the software.") },
        confirmButton = { Button(onClick = {
            confirmation = false
            if (edit) viewModel.update(EditResidentRequest(name.trim(), mobile.trim(), email.trim(), emergency.trim(), governmentId.trim(), notes.trim(), rentValue, dueDayValue, billingStart, roomId, bedId))
            else viewModel.create(NewResidentRequest(name.trim(), mobile.trim(), email.trim(), governmentId.trim(), emergency.trim(), admissionDate, billingStart, roomId, bedId, rentValue, dueDayValue, depositValue, depositPaidValue, depositMethod, notes.trim(), idempotencyKey))
        }, enabled = !state.busy) { Text(if (edit) "Save changes" else "Confirm admission") } },
        dismissButton = { TextButton(onClick = { confirmation = false }, enabled = !state.busy) { Text("Cancel") } },
    )

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { com.aashray.hospitality.ui.PageIntro("Resident record", if (edit) "Edit resident" else "Add resident", if (edit) "Profile changes and future rent schedule updates are written to the server." else "New billing starts in the current month. The monthly due day follows the resident's admission date.") }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(name, { name = it.take(140) }, Modifier.fillMaxWidth(), label = { Text("Full name") }, singleLine = true)
                    OutlinedTextField(mobile, { mobile = it.take(24) }, Modifier.fillMaxWidth(), label = { Text("Mobile number") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                    OutlinedTextField(email, { email = it.take(254) }, Modifier.fillMaxWidth(), label = { Text("Email (optional)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                    OutlinedTextField(emergency, { emergency = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Emergency contact (optional)") }, singleLine = true)
                    OutlinedTextField(governmentId, { governmentId = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("Government ID (optional)") }, singleLine = true)
                    if (!edit) OutlinedTextField(admissionDate, { admissionDate = it.take(10) }, Modifier.fillMaxWidth(), label = { Text("Admission date (YYYY-MM-DD)") }, singleLine = true)
                    SelectionField("Property", propertyId, state.properties.map { it._id to it.name }, { propertyId = it; roomId = ""; bedId = ""; viewModel.selectProperty(it) }, "Choose property")
                    SelectionField("Room", roomId, state.rooms.map { it._id to "Room ${it.roomNumber} · ${it.roomType} · ${it.available} available" }, { roomId = it; bedId = "" }, "Choose room")
                    if (selectedRoom != null) SelectionField("Bed", bedId, selectedRoom.beds.filter { it.active }.map { it.bedId to "Bed ${it.bedId}" }, { bedId = it }, "Choose bed")
                    OutlinedTextField(monthlyRent, { monthlyRent = it.filter { ch -> ch.isDigit() || ch == '.' } }, Modifier.fillMaxWidth(), label = { Text("Monthly rent (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                    OutlinedTextField("Day $dueDayValue of each month", {}, Modifier.fillMaxWidth(), label = { Text("Monthly rent due day (admission date)") }, supportingText = { Text("If the month is shorter, the due date is its last day.") }, singleLine = true, readOnly = true)
                    OutlinedTextField(billingStart, { if (edit) billingStart = it.take(10) }, Modifier.fillMaxWidth(), label = { Text(if (edit) "Rent / room change effective date (future month start)" else "Billing starts") }, supportingText = { Text(if (edit) "Future schedule changes start from the selected period." else "The first charge is for the current month; admission history does not create earlier bills.") }, singleLine = true, readOnly = !edit)
                    if (edit) {
                        OutlinedButton(onClick = { viewModel.previewRent(billingStart, dueDayValue, rentValue) }, enabled = state.resident != null && rentValue > 0 && dueDayValue in 1..31, modifier = Modifier.fillMaxWidth()) { Text("Preview rent schedule") }
                        state.rentPreview?.let { Text("${it.periodKey} · ${money(it.amountPaise)} due ${it.dueAt?.take(10).orEmpty()}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
                    } else {
                        OutlinedTextField(deposit, { deposit = it.filter { ch -> ch.isDigit() || ch == '.' } }, Modifier.fillMaxWidth(), label = { Text("Agreed security deposit (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                        OutlinedTextField(depositPaid, { depositPaid = it.filter { ch -> ch.isDigit() || ch == '.' } }, Modifier.fillMaxWidth(), label = { Text("Deposit received now (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                        SelectionField("Deposit method", depositMethod, listOf("CASH" to "Cash", "BANK_TRANSFER" to "Bank transfer", "UPI" to "UPI", "OTHER" to "Other"), { depositMethod = it })
                    }
                    OutlinedTextField(notes, { notes = it.take(3000) }, Modifier.fillMaxWidth(), label = { Text("Notes (optional)") }, minLines = 3)
                    Button(onClick = { confirmation = true }, enabled = !state.loading && !state.busy && name.trim().length >= 2 && mobile.trim().length >= 8 && (email.isBlank() || android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) && propertyId.isNotBlank() && selectedRoom != null && bedId.isNotBlank() && rentValue > 0 && dueDayValue in 1..31 && billingStart.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && (edit || admissionDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && depositValue >= 0 && depositPaidValue in 0.0..depositValue), modifier = Modifier.fillMaxWidth()) {
                        if (state.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                        Text(if (edit) "Review and save changes" else "Review and admit resident")
                    }
                    TextButton(onClick = onCancel, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
                }
            }
        }
    }
}
