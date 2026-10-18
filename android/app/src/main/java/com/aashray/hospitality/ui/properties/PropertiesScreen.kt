package com.aashray.hospitality.ui.properties

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aashray.hospitality.data.NewPropertyRequest
import com.aashray.hospitality.data.PropertyDto
import com.aashray.hospitality.ui.EmptyContent
import com.aashray.hospitality.ui.ErrorContent
import com.aashray.hospitality.ui.LoadState
import com.aashray.hospitality.ui.LoadingContent
import com.aashray.hospitality.ui.PageIntro
import com.aashray.hospitality.ui.PropertyCreateState
import com.aashray.hospitality.ui.PropertiesViewModel
import com.aashray.hospitality.ui.SectionTitle
import com.aashray.hospitality.ui.money

@Composable
fun PropertiesScreen(
    onOpenProperty: (String) -> Unit,
    canCreateProperty: Boolean,
    viewModel: PropertiesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val createState by viewModel.createState.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var createdMessage by remember { mutableStateOf(false) }

    LaunchedEffect(createState) {
        if (createState == PropertyCreateState.Created) {
            showCreateDialog = false
            createdMessage = true
            viewModel.resetCreateState()
        }
    }

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { PageIntro("Property workspace", "Properties", "Occupancy, collections and outstanding balances by property.") }
        if (canCreateProperty) item {
            Button(onClick = { viewModel.resetCreateState(); showCreateDialog = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("Add property", Modifier.padding(start = 8.dp))
            }
        }
        if (createdMessage) item {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                Text("Property added successfully.", Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val properties = current.value.properties
                item { SectionTitle("All properties", "${properties.size} total") }
                if (properties.isEmpty()) item { EmptyContent("No properties yet", "There are no property records in this Aashray workspace.") }
                items(properties, key = { it._id }) { PropertyCard(it) { onOpenProperty(it._id) } }
                if (current.value.unassignedRooms > 0) item {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(14.dp)) {
                        Text("${current.value.unassignedRooms} room(s) still need an administrator-reviewed property assignment.", Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }

    if (showCreateDialog && canCreateProperty) {
        CreatePropertyDialog(
            state = createState,
            onDismiss = { if (createState != PropertyCreateState.Saving) showCreateDialog = false },
            onCreate = viewModel::createProperty,
        )
    }
}

@Composable
private fun CreatePropertyDialog(
    state: PropertyCreateState,
    onDismiss: () -> Unit,
    onCreate: (NewPropertyRequest) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    val saving = state == PropertyCreateState.Saving
    val serverError = (state as? PropertyCreateState.Failed)?.message

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        title = { Text("Add property") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Create a property workspace. You can add rooms and residents after saving.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it.take(160); validationError = null }, Modifier.fillMaxWidth(), label = { Text("Property name *") }, singleLine = true)
                OutlinedTextField(address, { address = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Address") }, minLines = 2, maxLines = 3)
                OutlinedTextField(phone, { phone = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Contact phone") }, singleLine = true)
                OutlinedTextField(email, { email = it.take(254); validationError = null }, Modifier.fillMaxWidth(), label = { Text("Contact email") }, singleLine = true)
                OutlinedTextField(notes, { notes = it.take(2000) }, Modifier.fillMaxWidth(), label = { Text("Notes") }, minLines = 2, maxLines = 4)
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                serverError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving,
                onClick = {
                    val trimmedName = name.trim()
                    val trimmedEmail = email.trim()
                    validationError = when {
                        trimmedName.length < 2 -> "Enter a property name with at least 2 characters."
                        trimmedEmail.isNotEmpty() && !android.util.Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches() -> "Enter a valid contact email."
                        else -> null
                    }
                    if (validationError == null) onCreate(NewPropertyRequest(trimmedName, address.trim(), phone.trim(), trimmedEmail, notes.trim()))
                },
            ) {
                if (saving) {
                    CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                }
                Text(if (saving) "Saving…" else "Create property")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
        },
    )
}

@Composable
private fun PropertyCard(property: PropertyDto, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Default.Business, contentDescription = null, modifier = Modifier.padding(11.dp), tint = MaterialTheme.colorScheme.primary)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(property.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(property.address.ifBlank { "Address not added" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
                Icon(Icons.Default.ArrowForwardIos, contentDescription = "Open ${property.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SmallStat("Rooms", property.totalRooms.toString(), Icons.Default.Business, Modifier.weight(1f))
                SmallStat("Beds", "${property.occupiedBeds}/${property.totalBeds}", Icons.Default.Bed, Modifier.weight(1f))
                SmallStat("Residents", property.activeResidents.toString(), Icons.Default.Groups, Modifier.weight(1f))
            }
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                MoneyRow("Current rent billed", money(property.financials.rentBilledPaise))
                MoneyRow("Rent collected", money(property.financials.rentCollectedPaise))
                MoneyRow("Rent outstanding", money(property.financials.rentOutstandingPaise), emphasized = true)
                MoneyRow("Utilities outstanding", money(property.financials.utilityOutstandingPaise))
            }
        }
    }
}

@Composable
private fun SmallStat(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Surface(modifier, color = MaterialTheme.colorScheme.background, shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun MoneyRow(label: String, value: String, emphasized: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = if (emphasized) FontWeight.Bold else FontWeight.Medium, color = if (emphasized) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
    }
}
