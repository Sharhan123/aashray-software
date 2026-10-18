package com.aashray.hospitality.ui.finance

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.R
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.ReceiptViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.money
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ReceiptScreen(viewModel: ReceiptViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var actionError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PageIntro("Finance", "Payment receipt", "Receipt details loaded from the saved backend payment record.") }
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val receipt = current.value
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(20.dp)) {
                        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Image(painterResource(R.drawable.aashray_original), contentDescription = "Aashray Group", contentScale = ContentScale.Crop, modifier = Modifier.width(112.dp).height(40.dp))
                                Column {
                                    Text("PAYMENT RECEIPT", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                    Text(receipt.receiptNumber, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            ReceiptInfo("Received from", receipt.payment.resident?.fullName.orEmpty())
                            ReceiptInfo("Resident ID", receipt.payment.resident?.residentId.orEmpty())
                            ReceiptInfo("Mobile", receipt.payment.resident?.mobile.orEmpty())
                            ReceiptInfo("Property", receipt.allocation?.room?.property?.name ?: "Aashray Hospitality")
                            ReceiptInfo("Room / bed", listOfNotNull(receipt.allocation?.room?.roomNumber, receipt.allocation?.bedId?.takeIf(String::isNotBlank)?.let { "Bed $it" }).joinToString(" · ").ifBlank { "—" })
                            ReceiptInfo("Date", receipt.payment.paymentDate?.take(10).orEmpty())
                            ReceiptInfo("Method", receipt.payment.method.replace('_', ' '))
                            SectionTitle("Payment breakdown", "${receipt.breakdown.size} allocation(s)")
                        }
                    }
                }
                if (receipt.breakdown.isEmpty()) item { ReceiptLine("Payment received", "Not allocated to a charge", receipt.payment.amountPaise) }
                items(receipt.breakdown) { line -> ReceiptLine(line.charge?.description ?: "Charge", line.charge?.periodKey.orEmpty(), line.amountPaise) }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(16.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Total received", style = MaterialTheme.typography.labelLarge)
                            Text(money(receipt.payment.amountPaise), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            ReceiptInfo("Reference", receipt.payment.reference.ifBlank { "—" })
                            ReceiptInfo("Note", receipt.payment.notes.ifBlank { "Payment received with thanks." })
                            if (receipt.payment.reversedAt != null) Text("This payment was reversed on the server.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                if (actionError != null) item { Text(actionError.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = {
                            scope.launch {
                                busy = true; actionError = null
                                runCatching { withContext(Dispatchers.IO) { ReceiptPdf.create(context, receipt) } }
                                    .onSuccess { file -> runCatching { ReceiptPdf.print(context, file, receipt.receiptNumber) }.onFailure { actionError = it.message ?: "Could not open Android print." } }
                                    .onFailure { actionError = it.message ?: "Could not create receipt PDF." }
                                busy = false
                            }
                        }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Print") }
                        Button(onClick = {
                            scope.launch {
                                busy = true; actionError = null
                                runCatching { withContext(Dispatchers.IO) { ReceiptPdf.create(context, receipt) } }
                                    .onSuccess { file -> runCatching { ReceiptPdf.share(context, file) }.onFailure { actionError = it.message ?: "Could not share receipt." } }
                                    .onFailure { actionError = it.message ?: "Could not create receipt PDF." }
                                busy = false
                            }
                        }, enabled = !busy, modifier = Modifier.weight(1f)) { Text(if (busy) "Preparing…" else "Share PDF") }
                    }
                }
                item { Text("Payment receipt · Not a tax invoice", modifier = Modifier.fillMaxWidth(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}

@Composable
private fun ReceiptInfo(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" }, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ReceiptLine(description: String, period: String, amount: Long) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(description, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(period.ifBlank { "—" }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(money(amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        }
    }
}
