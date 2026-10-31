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
import androidx.compose.material3.LinearProgressIndicator
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
import com.aashray.hospitality.ui.finance.SelectionField

@Composable
fun PropertiesScreen(
    onOpenProperty: (String) -> Unit,
    canCreateProperty: Boolean,
    viewModel: PropertiesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val createState by viewModel.createState.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var editingProperty by remember { mutableStateOf<PropertyDto?>(null) }
    var deactivateTarget by remember { mutableStateOf<PropertyDto?>(null) }
    var deleteTarget by remember { mutableStateOf<PropertyDto?>(null) }
    var deleteReason by remember { mutableStateOf("") }
    var createdMessage by remember { mutableStateOf(false) }
    var selectedGender by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(createState) {
        if (createState == PropertyCreateState.Created) {
            showCreateDialog = false
            createdMessage = true
            viewModel.resetCreateState()
        }
    }

    LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { PageIntro(if (selectedGender == null) "Owner operations" else "${selectedGender!!.lowercase().replaceFirstChar { it.uppercase() }} portfolio", if (selectedGender == null) "Properties" else "${selectedGender!!.lowercase().replaceFirstChar { it.uppercase() }} properties", if (selectedGender == null) "Choose an accommodation type to review its occupancy and property list." else "Current occupancy, rent collections and overdue balances.") }
        if (selectedGender != null) item { TextButton(onClick = { selectedGender = null }) { Text("‹  Back to property types") } }
        if (canCreateProperty) item {
            Button(onClick = { viewModel.resetCreateState(); viewModel.clearActionMessage(); editingProperty = null; showCreateDialog = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("Add property", Modifier.padding(start = 8.dp))
            }
        }
        if (createdMessage) item {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                Text("Property added successfully.", Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        action.message?.let { message -> item { Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) { Text(message, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) } } }
        action.error?.let { error -> item { Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) { Text(error, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer) } } }
        when (val current = state) {
            LoadState.Loading -> item { LoadingContent() }
            is LoadState.Failed -> item { ErrorContent(current.message, viewModel::refresh) }
            is LoadState.Ready -> {
                val allProperties = current.value.properties
                val activeProperties = allProperties.filter { it.active }
                val maleProperties = activeProperties.filter { it.gender == "MALE" }
                val femaleProperties = activeProperties.filter { it.gender == "FEMALE" }
                if (selectedGender == null) {
                    item { SectionTitle("Occupancy by property type", "Active residents and bed capacity across active properties") }
                    item { GenderPortfolioCard("Male residents", maleProperties, onClick = { selectedGender = "MALE" }) }
                    item { GenderPortfolioCard("Female residents", femaleProperties, onClick = { selectedGender = "FEMALE" }) }
                    val unassigned = activeProperties.filter { it.gender != "MALE" && it.gender != "FEMALE" }
                    if (unassigned.isNotEmpty()) item {
                        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(14.dp)) {
                            Text("${unassigned.size} active properties have no assigned resident gender. Edit them to include them in the portfolios.", Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                val properties = when (selectedGender) {
                    "MALE" -> allProperties.filter { it.gender == "MALE" }
                    "FEMALE" -> allProperties.filter { it.gender == "FEMALE" }
                    else -> emptyList()
                }
                if (selectedGender != null) item { SectionTitle("${selectedGender!!.lowercase().replaceFirstChar { it.uppercase() }} properties", "${properties.size} properties") }
                if (selectedGender != null && properties.isEmpty()) item { EmptyContent("No properties yet", "There are no properties in this accommodation group.") }
                if (selectedGender != null) items(properties, key = { it._id }) { property ->
                    PropertyCard(
                        property = property,
                        canManage = canCreateProperty,
                        onClick = { onOpenProperty(property._id) },
                        onEdit = { viewModel.clearActionMessage(); editingProperty = property; showCreateDialog = true },
                        onDeactivate = { deactivateTarget = property },
                        onDelete = { deleteTarget = property; deleteReason = "" },
                    )
                }
                if (selectedGender != null && current.value.unassignedRooms > 0) item {
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
            property = editingProperty,
            onDismiss = { if (createState != PropertyCreateState.Saving) showCreateDialog = false },
            onSave = { property, request ->
                if (property == null) viewModel.createProperty(request)
                else { viewModel.updateProperty(property._id, request); showCreateDialog = false }
            },
        )
    }
    deactivateTarget?.let { property ->
        AlertDialog(
            onDismissRequest = { if (!action.busy) deactivateTarget = null },
            title = { Text("Deactivate ${property.name}?") },
            text = { Text("Residents must be checked out and all rooms deactivated first. Historical financial records will remain available.") },
            confirmButton = { Button(onClick = { viewModel.deactivateProperty(property._id); deactivateTarget = null }, enabled = !action.busy) { Text("Deactivate") } },
            dismissButton = { TextButton(onClick = { deactivateTarget = null }, enabled = !action.busy) { Text("Cancel") } },
        )
    }
    deleteTarget?.let { property ->
        AlertDialog(
            onDismissRequest = { if (!action.busy) deleteTarget = null },
            title = { Text("Delete ${property.name}?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("This permanently removes the property record. Its rooms and historical resident and financial records will be preserved as unassigned legacy records. Active residents must be checked out first.")
                    OutlinedTextField(deleteReason, { deleteReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Audit reason (required)") }, minLines = 2)
                }
            },
            confirmButton = { Button(onClick = { viewModel.deleteProperty(property._id, deleteReason); deleteTarget = null }, enabled = !action.busy && deleteReason.trim().length >= 5) { Text("Delete property") } },
            dismissButton = { TextButton(onClick = { deleteTarget = null }, enabled = !action.busy) { Text("Cancel") } },
        )
    }
}

@Composable
private fun GenderPortfolioCard(title: String, properties: List<PropertyDto>, onClick: () -> Unit) {
    val residents = properties.sumOf { it.activeResidents }
    val rooms = properties.sumOf { it.totalRooms }
    val beds = properties.sumOf { it.totalBeds }
    val occupied = properties.sumOf { it.occupiedBeds }
    val vacant = properties.sumOf { it.vacantBeds }
    val progress = if (beds == 0) 0f else occupied.toFloat() / beds
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("$residents active residents", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                }
                Icon(Icons.Default.ArrowForwardIos, contentDescription = "View $title properties", tint = MaterialTheme.colorScheme.primary)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallStat("Properties", properties.count { it.active }.toString(), Icons.Default.Business, Modifier.weight(1f))
                SmallStat("Rooms", rooms.toString(), Icons.Default.Business, Modifier.weight(1f))
                SmallStat("Vacant beds", vacant.toString(), Icons.Default.Bed, Modifier.weight(1f))
            }
            LinearProgressIndicator(progress, Modifier.fillMaxWidth().heightIn(min = 6.dp), color = MaterialTheme.colorScheme.primary)
            Text("$occupied / $beds beds occupied · ${(progress * 100).toInt()}% occupancy · ${properties.size} properties", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CreatePropertyDialog(
    state: PropertyCreateState,
    property: PropertyDto?,
    onDismiss: () -> Unit,
    onSave: (PropertyDto?, NewPropertyRequest) -> Unit,
) {
    var name by remember(property?._id) { mutableStateOf(property?.name.orEmpty()) }
    var address by remember(property?._id) { mutableStateOf(property?.address.orEmpty()) }
    var phone by remember(property?._id) { mutableStateOf(property?.contactPhone.orEmpty()) }
    var email by remember(property?._id) { mutableStateOf(property?.contactEmail.orEmpty()) }
    var notes by remember(property?._id) { mutableStateOf(property?.notes.orEmpty()) }
    var gender by remember(property?._id) { mutableStateOf(property?.gender.orEmpty()) }
    var validationError by remember { mutableStateOf<String?>(null) }
    val saving = state == PropertyCreateState.Saving
    val serverError = (state as? PropertyCreateState.Failed)?.message

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        title = { Text(if (property == null) "Add property" else "Edit ${property.name}") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(if (property == null) "Create a property workspace. You can add rooms and residents after saving." else "Update property details. Existing rooms and their history are preserved.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it.take(160); validationError = null }, Modifier.fillMaxWidth(), label = { Text("Property name *") }, singleLine = true)
                SelectionField("Resident gender *", gender, listOf("MALE" to "Male", "FEMALE" to "Female"), { gender = it })
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
                        gender !in setOf("MALE", "FEMALE") -> "Choose the resident gender for this property."
                        trimmedEmail.isNotEmpty() && !android.util.Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches() -> "Enter a valid contact email."
                        else -> null
                    }
                    if (validationError == null) onSave(property, NewPropertyRequest(name = trimmedName, address = address.trim(), contactPhone = phone.trim(), contactEmail = trimmedEmail, notes = notes.trim(), gender = gender))
                },
            ) {
                if (saving) {
                    CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                }
                Text(if (saving) "Saving…" else if (property == null) "Create property" else "Save changes")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
        },
    )
}

@Composable
private fun PropertyCard(property: PropertyDto, canManage: Boolean, onClick: () -> Unit, onEdit: () -> Unit, onDeactivate: () -> Unit, onDelete: () -> Unit) {
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
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(16.dp)) {
                    Text(if (property.gender == "FEMALE") "FEMALE" else "MALE", Modifier.padding(horizontal = 10.dp, vertical = 5.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
                Surface(color = if (property.active) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(16.dp)) {
                    Text(if (property.active) "ACTIVE" else "INACTIVE", Modifier.padding(horizontal = 10.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SmallStat("Rooms", property.totalRooms.toString(), Icons.Default.Business, Modifier.weight(1f))
                SmallStat("Beds", "${property.occupiedBeds}/${property.totalBeds}", Icons.Default.Bed, Modifier.weight(1f))
                SmallStat("Residents", property.activeResidents.toString(), Icons.Default.Groups, Modifier.weight(1f))
            }
            val occupancy = if (property.totalBeds == 0) 0f else property.occupiedBeds.toFloat() / property.totalBeds
            LinearProgressIndicator(occupancy, Modifier.fillMaxWidth().heightIn(min = 6.dp), color = MaterialTheme.colorScheme.primary)
            Text("${property.vacantBeds} vacant beds · ${(occupancy * 100).toInt()}% occupied", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                MoneyRow("Rent billed · current period", money(property.financials.rentBilledPaise))
                MoneyRow("Rent collected", money(property.financials.rentCollectedPaise))
                MoneyRow("Overdue rent", money(property.financials.overdueRentPaise), emphasized = true)
                MoneyRow("Utilities outstanding", money(property.financials.utilityOutstandingPaise))
            }
            if (canManage) {
                androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .35f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = onEdit, modifier = Modifier.weight(1f)) { Text("Edit") }
                    if (property.active) TextButton(onClick = onDeactivate, modifier = Modifier.weight(1f)) { Text("Deactivate") }
                    TextButton(onClick = onDelete, modifier = Modifier.weight(1f)) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                }
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
