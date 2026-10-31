package com.aashray.hospitality.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aashray.hospitality.data.AashrayRepository
import com.aashray.hospitality.data.ApiFailure
import com.aashray.hospitality.data.DashboardResponse
import com.aashray.hospitality.data.BillingPreviewResponse
import com.aashray.hospitality.data.BillingGenerationResponse
import com.aashray.hospitality.data.ChargeDto
import com.aashray.hospitality.data.NewPaymentRequest
import com.aashray.hospitality.data.PaymentDto
import com.aashray.hospitality.data.ReceiptResponse
import com.aashray.hospitality.data.AppSettingsDto
import com.aashray.hospitality.data.EditResidentRequest
import com.aashray.hospitality.data.NewResidentRequest
import com.aashray.hospitality.data.RentPreviewResponse
import com.aashray.hospitality.data.DepositRequest
import com.aashray.hospitality.data.MessageDto
import com.aashray.hospitality.data.PreparedMessageResponse
import com.aashray.hospitality.data.PrepareMessageRequest
import com.aashray.hospitality.data.ReportResponse
import com.aashray.hospitality.data.UtilityRequest
import com.aashray.hospitality.data.OwnerReminderDto
import com.aashray.hospitality.data.OwnerReminderRequest
import com.aashray.hospitality.data.PropertyDto
import com.aashray.hospitality.data.PropertyResponse
import com.aashray.hospitality.data.NewPropertyRequest
import com.aashray.hospitality.data.ResidentDto
import com.aashray.hospitality.data.ResidentListResponse
import com.aashray.hospitality.data.ResidentImportPreviewDto
import com.aashray.hospitality.data.ResidentImportCommitDto
import com.aashray.hospitality.data.ResidentProfileResponse
import com.aashray.hospitality.data.CheckoutRequest
import com.aashray.hospitality.data.CheckoutRefundRequest
import com.aashray.hospitality.data.ReadmitRequest
import com.aashray.hospitality.data.StaffDto
import com.aashray.hospitality.data.StaffCreateRequest
import com.aashray.hospitality.data.StaffUpdateRequest
import com.aashray.hospitality.data.RoomWriteRequest
import com.aashray.hospitality.data.RoomDto
import com.aashray.hospitality.data.UserDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SessionState {
    data object Loading : SessionState
    data object SigningIn : SessionState
    data class SignedOut(val message: String? = null) : SessionState
    data class SignedIn(val user: UserDto) : SessionState
}

@HiltViewModel
class SessionViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init { restore() }

    fun restore() {
        viewModelScope.launch {
            _state.value = SessionState.Loading
            _state.value = try { SessionState.SignedIn(repository.currentUser()) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { SessionState.SignedOut(error.message) }
        }
    }

    fun login(email: String, password: String) {
        if (_state.value == SessionState.SigningIn) return
        viewModelScope.launch {
            _state.value = SessionState.SigningIn
            _state.value = try { SessionState.SignedIn(repository.login(email, password)) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { SessionState.SignedOut(error.message ?: "Sign in failed. Please try again.") }
        }
    }

    fun logout() {
        viewModelScope.launch {
            try { repository.logout() }
            catch (error: CancellationException) { throw error }
            catch (_: Exception) { repository.clearSession() }
            _state.value = SessionState.SignedOut()
        }
    }
}

sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Ready<T>(val value: T) : LoadState<T>
    data class Failed(val message: String) : LoadState<Nothing>
}

@HiltViewModel
class DashboardViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<DashboardResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<DashboardResponse>> = _state.asStateFlow()
    init { refresh() }
    fun refresh() { viewModelScope.launch { _state.value = load { repository.dashboard() } } }
}

@HiltViewModel
class PropertiesViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<PropertyResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<PropertyResponse>> = _state.asStateFlow()
    private val _createState = MutableStateFlow<PropertyCreateState>(PropertyCreateState.Idle)
    val createState: StateFlow<PropertyCreateState> = _createState.asStateFlow()
    private val _action = MutableStateFlow(PropertyActionState())
    val action: StateFlow<PropertyActionState> = _action.asStateFlow()
    init { refresh() }
    fun refresh() { viewModelScope.launch { _state.value = load { repository.properties() } } }
    fun createProperty(request: NewPropertyRequest) {
        if (_createState.value == PropertyCreateState.Saving) return
        viewModelScope.launch {
            _createState.value = PropertyCreateState.Saving
            try {
                repository.createProperty(request)
                _createState.value = PropertyCreateState.Created
                refresh()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _createState.value = PropertyCreateState.Failed(error.message ?: "Could not create the property.")
            }
        }
    }
    fun resetCreateState() { _createState.value = PropertyCreateState.Idle }
    fun updateProperty(id: String, request: NewPropertyRequest) {
        if (_action.value.busy) return
        viewModelScope.launch {
            _action.value = PropertyActionState(busy = true)
            runCatching { repository.updateProperty(id, request) }
                .onSuccess { _action.value = PropertyActionState(message = "Property details updated."); refresh() }
                .onFailure { _action.value = PropertyActionState(error = it.message ?: "Could not update the property.") }
        }
    }
    fun deactivateProperty(id: String) {
        if (_action.value.busy) return
        viewModelScope.launch {
            _action.value = PropertyActionState(busy = true)
            runCatching { repository.deactivateProperty(id) }
                .onSuccess { _action.value = PropertyActionState(message = "Property deactivated. Historical records remain available."); refresh() }
                .onFailure { _action.value = PropertyActionState(error = it.message ?: "Could not deactivate the property.") }
        }
    }
    fun deleteProperty(id: String, reason: String) {
        if (_action.value.busy || reason.trim().length < 5) return
        viewModelScope.launch {
            _action.value = PropertyActionState(busy = true)
            runCatching { repository.deleteProperty(id, reason.trim()) }
                .onSuccess { _action.value = PropertyActionState(message = "Property deleted. Its room and financial history was preserved."); refresh() }
                .onFailure { _action.value = PropertyActionState(error = it.message ?: "Could not delete the property.") }
        }
    }
    fun clearActionMessage() { _action.value = PropertyActionState() }
}

sealed interface PropertyCreateState {
    data object Idle : PropertyCreateState
    data object Saving : PropertyCreateState
    data object Created : PropertyCreateState
    data class Failed(val message: String) : PropertyCreateState
}

data class PropertyActionState(val busy: Boolean = false, val message: String? = null, val error: String? = null)

data class PropertyDetailData(val property: PropertyDto, val rooms: List<RoomDto>, val residents: ResidentListResponse)

@HiltViewModel
class PropertyDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val propertyId: String = checkNotNull(savedStateHandle["propertyId"])
    private val _state = MutableStateFlow<LoadState<PropertyDetailData>>(LoadState.Loading)
    val state: StateFlow<LoadState<PropertyDetailData>> = _state.asStateFlow()
    init { refresh() }
    fun refresh() {
        viewModelScope.launch {
            _state.value = load {
                val properties = async { repository.properties() }
                val rooms = async { repository.rooms(propertyId) }
                val residents = async { repository.residents(limit = 100, propertyId = propertyId) }
                val property = properties.await().properties.firstOrNull { it._id == propertyId }
                    ?: throw ApiFailure("Property not found.", 404)
                PropertyDetailData(property, rooms.await().rooms, residents.await())
            }
        }
    }
}

data class ResidentReminderState(
    val busyResidentId: String? = null,
    val prepared: PreparedMessageResponse? = null,
    val error: String? = null,
)

@HiltViewModel
class ResidentsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val propertyId: String? = savedStateHandle["propertyId"]
    private val _properties = MutableStateFlow<List<com.aashray.hospitality.data.PropertyDto>>(emptyList())
    val properties: StateFlow<List<com.aashray.hospitality.data.PropertyDto>> = _properties.asStateFlow()
    private val _rooms = MutableStateFlow<List<com.aashray.hospitality.data.RoomDto>>(emptyList())
    val rooms: StateFlow<List<com.aashray.hospitality.data.RoomDto>> = _rooms.asStateFlow()
    private val _state = MutableStateFlow<LoadState<ResidentListResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<ResidentListResponse>> = _state.asStateFlow()
    private val _statusCounts = MutableStateFlow(ResidentStatusCounts())
    val statusCounts: StateFlow<ResidentStatusCounts> = _statusCounts.asStateFlow()
    private val _importState = MutableStateFlow(ResidentImportState())
    val importState: StateFlow<ResidentImportState> = _importState.asStateFlow()
    private val _search = MutableStateFlow("")
    val search: StateFlow<String> = _search.asStateFlow()
    private val _status = MutableStateFlow<String?>(savedStateHandle["status"] ?: "ACTIVE")
    val status: StateFlow<String?> = _status.asStateFlow()
    private val _rentPaymentStatus = MutableStateFlow<String?>(savedStateHandle["rentStatus"])
    val rentPaymentStatus: StateFlow<String?> = _rentPaymentStatus.asStateFlow()
    private val _selectedPropertyId = MutableStateFlow(propertyId.orEmpty())
    val selectedPropertyId: StateFlow<String> = _selectedPropertyId.asStateFlow()
    private val _selectedRoomId = MutableStateFlow("")
    val selectedRoomId: StateFlow<String> = _selectedRoomId.asStateFlow()
    private val _roomType = MutableStateFlow("")
    val roomType: StateFlow<String> = _roomType.asStateFlow()
    private val _outstanding = MutableStateFlow("")
    val outstanding: StateFlow<String> = _outstanding.asStateFlow()
    private val _sort = MutableStateFlow("createdAt")
    val sort: StateFlow<String> = _sort.asStateFlow()
    private val _direction = MutableStateFlow("desc")
    val direction: StateFlow<String> = _direction.asStateFlow()
    private val _loadingMore = MutableStateFlow(false)
    val loadingMore: StateFlow<Boolean> = _loadingMore.asStateFlow()
    private val _loadMoreError = MutableStateFlow<String?>(null)
    val loadMoreError: StateFlow<String?> = _loadMoreError.asStateFlow()
    private val _reminders = MutableStateFlow(ResidentReminderState())
    val reminders: StateFlow<ResidentReminderState> = _reminders.asStateFlow()
    private var searchJob: Job? = null
    private var page = 1
    fun previewImport(csv: String) {
        if (csv.isBlank() || _importState.value.busy) return
        viewModelScope.launch {
            _importState.value = ResidentImportState(csv = csv, busy = true)
            runCatching { repository.previewResidentImport(csv) }
                .onSuccess { _importState.value = ResidentImportState(csv = csv, preview = it) }
                .onFailure { _importState.value = ResidentImportState(csv = csv, error = it.message ?: "Could not preview the CSV file.") }
        }
    }
    fun commitImport() {
        val current = _importState.value
        val preview = current.preview ?: return
        if (current.busy || preview.validCount == 0) return
        viewModelScope.launch {
            _importState.value = current.copy(busy = true, error = null)
            runCatching { repository.commitResidentImport(current.csv, preview.previewId) }
                .onSuccess { result ->
                    _importState.value = current.copy(busy = false, result = result)
                    refresh()
                    refreshStatusCounts()
                }
                .onFailure { _importState.value = current.copy(busy = false, error = it.message ?: "Could not import residents.") }
        }
    }
    fun clearImport() { _importState.value = ResidentImportState() }
    fun prepareReminder(residentId: String, type: String) {
        if (_reminders.value.busyResidentId != null) return
        viewModelScope.launch {
            _reminders.value = ResidentReminderState(busyResidentId = residentId)
            runCatching { repository.prepareMessage(PrepareMessageRequest(residentId = residentId, propertyId = propertyId, messageType = type)) }
                .onSuccess { _reminders.value = ResidentReminderState(prepared = it) }
                .onFailure { _reminders.value = ResidentReminderState(error = it.message ?: "Could not prepare the reminder.") }
        }
    }
    fun consumePreparedReminder() { _reminders.value = _reminders.value.copy(prepared = null) }
    fun failReminderLaunch(message: String) { _reminders.value = ResidentReminderState(error = message) }
    fun markReminderOpened(id: String) {
        viewModelScope.launch {
            runCatching { repository.markMessageOpened(id) }
                .onFailure { _reminders.value = _reminders.value.copy(error = it.message ?: "The reminder opened, but its activity could not be recorded.") }
        }
    }
    init {
        refresh(); refreshStatusCounts()
        viewModelScope.launch {
            runCatching { repository.properties().properties }.onSuccess { _properties.value = it.filter { p -> p.active } }
            loadRooms(_selectedPropertyId.value)
        }
    }
    private fun loadRooms(forProperty: String) {
        viewModelScope.launch { runCatching { repository.rooms(forProperty.takeIf(String::isNotBlank)).rooms }.onSuccess { _rooms.value = it.filter(RoomDto::active) } }
    }
    fun setProperty(value: String) { _selectedPropertyId.value = value; _selectedRoomId.value = ""; loadRooms(value); refresh() }
    fun setRoom(value: String) { _selectedRoomId.value = value; refresh() }
    fun setRoomType(value: String) { _roomType.value = value; _selectedRoomId.value = ""; refresh() }
    fun setOutstanding(value: String) { _outstanding.value = value; refresh() }
    fun setSort(value: String) { _sort.value = value; refresh() }
    fun setDirection(value: String) { _direction.value = value; refresh() }
    fun clearFilters() {
        _search.value = ""; _selectedRoomId.value = ""; _roomType.value = ""; _outstanding.value = ""; _rentPaymentStatus.value = null
        _sort.value = "createdAt"; _direction.value = "desc"
        refresh("")
    }
    private fun refreshStatusCounts() {
        viewModelScope.launch {
            val active = runCatching { repository.residents(page = 1, limit = 1, propertyId = propertyId, status = "ACTIVE").total }.getOrDefault(0)
            val notice = runCatching { repository.residents(page = 1, limit = 1, propertyId = propertyId, status = "NOTICE").total }.getOrDefault(0)
            val checkedOut = runCatching { repository.residents(page = 1, limit = 1, propertyId = propertyId, status = "INACTIVE").total }.getOrDefault(0)
            _statusCounts.value = ResidentStatusCounts(active, notice, checkedOut)
        }
    }
    fun setSearch(value: String) {
        _search.value = value
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            refresh(value)
        }
    }
    fun setStatus(value: String?) {
        _status.value = value
        searchJob?.cancel()
        refresh()
    }
    fun setRentPaymentStatus(value: String?) {
        _rentPaymentStatus.value = value
        searchJob?.cancel()
        refresh()
    }
    fun refresh(value: String = _search.value) {
        page = 1
        _loadMoreError.value = null
        val period = java.time.YearMonth.now().toString()
        viewModelScope.launch { _state.value = load { repository.residents(page = 1, limit = 100, search = value, propertyId = _selectedPropertyId.value.takeIf(String::isNotBlank), status = _status.value, rentPaymentStatus = _rentPaymentStatus.value, rentPeriod = period, roomType = _roomType.value.takeIf(String::isNotBlank), roomId = _selectedRoomId.value.takeIf(String::isNotBlank), outstanding = _outstanding.value.takeIf(String::isNotBlank), sort = _sort.value, direction = _direction.value) } }
    }
    fun loadMore() {
        val current = (_state.value as? LoadState.Ready)?.value ?: return
        if (_loadingMore.value || page >= current.pages) return
        viewModelScope.launch {
            _loadingMore.value = true
            _loadMoreError.value = null
            val nextPage = page + 1
            runCatching { repository.residents(page = nextPage, limit = 100, search = _search.value, propertyId = _selectedPropertyId.value.takeIf(String::isNotBlank), status = _status.value, rentPaymentStatus = _rentPaymentStatus.value, rentPeriod = java.time.YearMonth.now().toString(), roomType = _roomType.value.takeIf(String::isNotBlank), roomId = _selectedRoomId.value.takeIf(String::isNotBlank), outstanding = _outstanding.value.takeIf(String::isNotBlank), sort = _sort.value, direction = _direction.value) }
                .onSuccess { result ->
                    page = nextPage
                    _state.value = LoadState.Ready(result.copy(residents = current.residents + result.residents))
                }
                .onFailure { _loadMoreError.value = it.message ?: "Could not load more residents." }
            _loadingMore.value = false
        }
    }
}

data class ResidentStatusCounts(val active: Int = 0, val notice: Int = 0, val checkedOut: Int = 0)
data class ResidentImportState(
    val csv: String = "",
    val preview: ResidentImportPreviewDto? = null,
    val result: ResidentImportCommitDto? = null,
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ResidentProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val residentId: String = checkNotNull(savedStateHandle["residentId"])
    private val _state = MutableStateFlow<LoadState<ResidentProfileResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<ResidentProfileResponse>> = _state.asStateFlow()
    private val _checkoutBusy = MutableStateFlow(false)
    val checkoutBusy: StateFlow<Boolean> = _checkoutBusy.asStateFlow()
    private val _checkoutMessage = MutableStateFlow<String?>(null)
    val checkoutMessage: StateFlow<String?> = _checkoutMessage.asStateFlow()
    private val _readmitProperties = MutableStateFlow<List<PropertyDto>>(emptyList())
    val readmitProperties: StateFlow<List<PropertyDto>> = _readmitProperties.asStateFlow()
    private val _readmitRooms = MutableStateFlow<List<RoomDto>>(emptyList())
    val readmitRooms: StateFlow<List<RoomDto>> = _readmitRooms.asStateFlow()
    init { refresh() }
    fun refresh() { viewModelScope.launch { _state.value = load { repository.resident(residentId) } } }
    fun checkout(request: CheckoutRequest) {
        if (_checkoutBusy.value) return
        viewModelScope.launch {
            _checkoutBusy.value = true
            _checkoutMessage.value = null
            runCatching { repository.checkoutResident(residentId, request) }
                .onSuccess { response ->
                    _checkoutMessage.value = "Checkout saved. Remaining deposit: ${money(response.depositBalancePaise)}. You can review the saved ledger and refund any eligible remainder later."
                    refresh()
                }
                .onFailure { _checkoutMessage.value = it.message ?: "Could not complete checkout." }
            _checkoutBusy.value = false
        }
    }
    fun refundCheckout(checkoutId: String, request: CheckoutRefundRequest) {
        if (_checkoutBusy.value) return
        viewModelScope.launch {
            _checkoutBusy.value = true
            _checkoutMessage.value = null
            runCatching { repository.refundCheckoutDeposit(residentId, checkoutId, request) }
                .onSuccess { response ->
                    _checkoutMessage.value = "Deposit refund recorded. Refundable balance remaining: ${money(response.refundableRemainingPaise)}."
                    refresh()
                }
                .onFailure { _checkoutMessage.value = it.message ?: "Could not record this deposit refund." }
            _checkoutBusy.value = false
        }
    }
    fun loadReadmitProperties() { viewModelScope.launch { runCatching { repository.properties().properties.filter { it.active } }.onSuccess { _readmitProperties.value = it }.onFailure { _checkoutMessage.value = it.message ?: "Could not load properties." } } }
    fun loadReadmitRooms(propertyId: String) { viewModelScope.launch { _readmitRooms.value = emptyList(); runCatching { repository.rooms(propertyId).rooms.filter { it.active && it.available > 0 } }.onSuccess { _readmitRooms.value = it }.onFailure { _checkoutMessage.value = it.message ?: "Could not load available rooms." } } }
    fun readmit(request: ReadmitRequest) {
        if (_checkoutBusy.value) return
        viewModelScope.launch {
            _checkoutBusy.value = true
            _checkoutMessage.value = null
            runCatching { repository.readmitResident(residentId, request) }
                .onSuccess { _checkoutMessage.value = "Resident readmitted. Previous checkout and settlement records have been kept."; refresh() }
                .onFailure { _checkoutMessage.value = it.message ?: "Could not readmit this resident." }
            _checkoutBusy.value = false
        }
    }
}

data class ResidentFormState(
    val properties: List<PropertyDto> = emptyList(),
    val rooms: List<RoomDto> = emptyList(),
    val resident: ResidentDto? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val rentPreview: RentPreviewResponse? = null,
    val error: String? = null,
    val savedId: String? = null,
)

@HiltViewModel
class ResidentFormViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val residentId: String? = savedStateHandle["residentId"]
    private val _state = MutableStateFlow(ResidentFormState())
    val state: StateFlow<ResidentFormState> = _state.asStateFlow()
    init {
        viewModelScope.launch {
            val properties = async { runCatching { repository.properties().properties }.getOrDefault(emptyList()) }
            val resident = async { residentId?.let { runCatching { repository.resident(it).resident }.getOrNull() } }
            val loadedProperties = properties.await()
            val loadedResident = resident.await()
            _state.value = _state.value.copy(properties = loadedProperties, resident = loadedResident, loading = false, error = if (residentId != null && loadedResident == null) "Could not load this resident for editing." else null)
            val roomNumber = loadedResident?.currentAllocation?.roomId?.roomNumber ?: loadedResident?.currentAllocation?.roomNumber
            val currentRoom = if (roomNumber != null) runCatching { repository.rooms().rooms.firstOrNull { it.roomNumber == roomNumber } }.getOrNull() else null
            if (!currentRoom?.propertyId.isNullOrBlank()) selectProperty(currentRoom?.propertyId.orEmpty())
        }
    }
    fun selectProperty(id: String) {
        _state.value = _state.value.copy(rooms = emptyList(), rentPreview = null)
        viewModelScope.launch { runCatching { repository.rooms(id).rooms }.onSuccess { _state.value = _state.value.copy(rooms = it) }.onFailure { _state.value = _state.value.copy(error = it.message) } }
    }
    fun previewRent(billingStartDate: String, dueDay: Int, monthlyRent: Double) {
        val id = residentId ?: return
        viewModelScope.launch { runCatching { repository.previewResidentRent(id, billingStartDate, dueDay, monthlyRent) }.onSuccess { _state.value = _state.value.copy(rentPreview = it) }.onFailure { _state.value = _state.value.copy(error = it.message) } }
    }
    fun create(request: NewResidentRequest) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            runCatching { repository.createResident(request) }.onSuccess { result ->
                val id = result.resident?._id
                _state.value = _state.value.copy(busy = false, savedId = id, error = if (id == null) "The server did not return the saved resident." else null)
            }.onFailure { _state.value = _state.value.copy(busy = false, error = it.message ?: "Could not save the resident.") }
        }
    }
    fun update(request: EditResidentRequest) {
        val id = residentId ?: return
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            runCatching { repository.updateResident(id, request) }.onSuccess { result ->
                _state.value = _state.value.copy(busy = false, savedId = result.resident?._id ?: id, error = if (result.resident == null) "The server did not return the updated resident." else null)
            }.onFailure { _state.value = _state.value.copy(busy = false, error = it.message ?: "Could not update the resident.") }
        }
    }
}

private suspend fun <T> load(block: suspend () -> T): LoadState<T> = try {
    LoadState.Ready(block())
} catch (error: CancellationException) {
    throw error
} catch (error: Exception) {
    LoadState.Failed(error.message ?: "Unable to load this information.")
}

data class BillingWorkspaceState(
    val properties: List<PropertyDto> = emptyList(),
    val charges: List<ChargeDto> = emptyList(),
    val preview: BillingPreviewResponse? = null,
    val busy: Boolean = false,
    val historyBusy: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class BillingViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(BillingWorkspaceState())
    val state: StateFlow<BillingWorkspaceState> = _state.asStateFlow()
    private var previewJob: Job? = null
    init {
        viewModelScope.launch { runCatching { repository.properties().properties }.onSuccess { _state.value = _state.value.copy(properties = it) } }
        loadHistory()
    }
    fun loadHistory(propertyId: String? = null) {
        viewModelScope.launch {
            _state.value = _state.value.copy(historyBusy = true)
            runCatching { repository.charges(limit = 100, propertyId = propertyId, kind = "RENT") }
                .onSuccess { _state.value = _state.value.copy(charges = it.charges, historyBusy = false) }
                .onFailure { _state.value = _state.value.copy(historyBusy = false, message = it.message ?: "Could not load rent billing history.") }
        }
    }
    fun invalidatePreview() {
        previewJob?.cancel()
        _state.value = _state.value.copy(preview = null, message = null)
    }
    fun preview(period: String, propertyId: String?) {
        previewJob?.cancel()
        previewJob = viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            runCatching { repository.previewBilling(period, propertyId) }
                .onSuccess { _state.value = _state.value.copy(preview = it, busy = false) }
                .onFailure { _state.value = _state.value.copy(preview = null, busy = false, message = it.message ?: "Could not preview rent.") }
        }
    }
    fun generate(onComplete: (BillingGenerationResponse) -> Unit) {
        val preview = _state.value.preview ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = null)
            runCatching { repository.generateBilling(preview.periodKey, preview.propertyId) }
                .onSuccess { _state.value = _state.value.copy(busy = false, preview = null); onComplete(it); loadHistory(preview.propertyId) }
                .onFailure { _state.value = _state.value.copy(busy = false, message = it.message ?: "Could not generate rent.") }
        }
    }
}

data class PaymentsWorkspaceState(
    val residents: List<ResidentDto> = emptyList(),
    val payments: List<PaymentDto> = emptyList(),
    val charges: List<ChargeDto> = emptyList(),
    val selectedResidentId: String? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val chargeError: String? = null,
    val message: String? = null,
    val receiptId: String? = null,
    val ledgerRows: List<com.aashray.hospitality.data.PaymentLedgerRowDto> = emptyList(),
    val ledgerKind: String = "all",
    val ledgerFrom: String = "",
    val ledgerTo: String = "",
    val ledgerLoading: Boolean = false,
    val ledgerError: String? = null,
)

@HiltViewModel
class PaymentsViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PaymentsWorkspaceState())
    val state: StateFlow<PaymentsWorkspaceState> = _state.asStateFlow()
    init { refresh(); loadLedger() }

    fun loadLedger(kind: String = _state.value.ledgerKind, from: String = _state.value.ledgerFrom, to: String = _state.value.ledgerTo) {
        _state.value = _state.value.copy(ledgerKind = kind, ledgerFrom = from, ledgerTo = to, ledgerLoading = true, ledgerError = null)
        viewModelScope.launch {
            runCatching { repository.paymentLedger(kind, from = from.takeIf(String::isNotBlank), to = to.takeIf(String::isNotBlank)) }
                .onSuccess { _state.value = _state.value.copy(ledgerRows = it.rows, ledgerLoading = false) }
                .onFailure { _state.value = _state.value.copy(ledgerLoading = false, ledgerError = it.message ?: "Could not load the payment ledger.") }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching {
                val residents = async { repository.allResidents(status = "ACTIVE") }
                val payments = async { repository.payments(limit = 100) }
                residents.await() to payments.await().payments
            }.onSuccess { (residents, payments) -> _state.value = _state.value.copy(residents = residents, payments = payments, loading = false) }
                .onFailure { _state.value = _state.value.copy(loading = false, error = it.message ?: "Could not load payments.") }
        }
    }

    fun selectResident(id: String) {
        _state.value = _state.value.copy(selectedResidentId = id, charges = emptyList(), chargeError = null)
        viewModelScope.launch {
            runCatching { repository.charges(limit = 100, residentId = id, status = null) }
                .onSuccess { _state.value = _state.value.copy(charges = it.charges.filter { charge -> charge.balancePaise > 0 }) }
                .onFailure { _state.value = _state.value.copy(chargeError = "Outstanding charge choices require billing access. You can still record this payment unallocated.") }
        }
    }

    fun record(request: NewPaymentRequest) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null, message = null)
            runCatching { repository.recordPayment(request) }
                .onSuccess { result ->
                    _state.value = _state.value.copy(busy = false, message = if (result.duplicate) "This payment request was already recorded. The existing server record is shown below." else "Payment recorded in the server ledger.")
                    refresh()
                    loadLedger()
                    result.payment?._id?.let { _state.value = _state.value.copy(receiptId = it) }
                }
                .onFailure { _state.value = _state.value.copy(busy = false, error = it.message ?: "Payment status is unknown. Refresh history before retrying.") }
        }
    }

    fun reverse(paymentId: String, reason: String) {
        if (_state.value.busy || reason.trim().length < 5) return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null, message = null)
            runCatching { repository.reversePayment(paymentId, reason.trim()) }
                .onSuccess {
                    _state.value = _state.value.copy(busy = false, message = "Payment reversed. Allocated balances were restored and the audit record was saved.")
                    refresh()
                    loadLedger()
                }
                .onFailure { _state.value = _state.value.copy(busy = false, error = it.message ?: "Could not reverse this payment.") }
        }
    }

    fun dismissReceipt() { _state.value = _state.value.copy(receiptId = null) }
}

@HiltViewModel
class ReceiptViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val paymentId: String = checkNotNull(savedStateHandle["paymentId"])
    private val _state = MutableStateFlow<LoadState<ReceiptResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<ReceiptResponse>> = _state.asStateFlow()
    init { refresh() }
    fun refresh() { viewModelScope.launch { _state.value = load { repository.receipt(paymentId) } } }
}

data class OperationsState(
    val residents: List<ResidentDto> = emptyList(),
    val messages: List<MessageDto> = emptyList(),
    val settings: AppSettingsDto? = null,
    val report: ReportResponse? = null,
    val preparedMessage: PreparedMessageResponse? = null,
    val depositProfile: ResidentProfileResponse? = null,
    val busy: Boolean = false,
    val messageBusy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val ownerReminders: List<OwnerReminderDto> = emptyList(),
    val staff: List<StaffDto> = emptyList(),
    val properties: List<PropertyDto> = emptyList(),
    val rooms: List<RoomDto> = emptyList(),
    val utilityCharges: List<ChargeDto> = emptyList(),
)

@HiltViewModel
class OperationsViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(OperationsState())
    val state: StateFlow<OperationsState> = _state.asStateFlow()
    fun clearPrepared() { _state.value = _state.value.copy(preparedMessage = null) }

    fun loadRoomWorkspace() { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        val properties = runCatching { repository.properties().properties }
        val rooms = runCatching { repository.rooms().rooms }
        if (rooms.isSuccess) _state.value = _state.value.copy(properties = properties.getOrDefault(emptyList()), rooms = rooms.getOrDefault(emptyList()), busy = false)
        else fail(rooms.exceptionOrNull()!!)
    } }
    fun createRoom(request: RoomWriteRequest) { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.createRoom(request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Room created."); loadRoomWorkspace() }.onFailure { fail(it) }
    } }
    fun updateRoom(id: String, request: RoomWriteRequest) { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.updateRoom(id, request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Room updated."); loadRoomWorkspace() }.onFailure { fail(it) }
    } }
    fun deactivateRoom(id: String) { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.deactivateRoom(id) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Room deactivated."); loadRoomWorkspace() }.onFailure { fail(it) }
    } }

    fun loadStaff() { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        val staffResult = runCatching { repository.staff().staff }
        val propertyResult = runCatching { repository.properties().properties }
        if (staffResult.isSuccess) _state.value = _state.value.copy(staff = staffResult.getOrDefault(emptyList()), properties = propertyResult.getOrDefault(emptyList()), busy = false)
        else fail(staffResult.exceptionOrNull()!!)
    } }
    fun createStaff(request: StaffCreateRequest) { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.createStaff(request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Staff account created."); loadStaff() }.onFailure { fail(it) }
    } }
    fun updateStaff(id: String, request: StaffUpdateRequest, notice: String = "Staff access updated.") { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.updateStaff(id, request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = notice); loadStaff() }.onFailure { fail(it) }
    } }
    fun resetStaffPassword(id: String, password: String) { viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        runCatching { repository.resetStaffPassword(id, password) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Password reset; prior staff sessions were revoked.") }.onFailure { fail(it) }
    } }

    fun loadOwnerReminders() { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.ownerReminders().reminders }.onSuccess { _state.value = _state.value.copy(ownerReminders = it, busy = false) }.onFailure { fail(it) } } }
    fun createOwnerReminder(request: OwnerReminderRequest) { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.createOwnerReminder(request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Reminder saved."); loadOwnerReminders() }.onFailure { fail(it) } } }
    fun acknowledgeOwnerReminder(id: String) { reminderAction { repository.acknowledgeOwnerReminder(id) } }
    fun snoozeOwnerReminder(id: String, minutes: Int) { reminderAction { repository.snoozeOwnerReminder(id, minutes) } }
    fun stopOwnerReminder(id: String) { reminderAction { repository.stopOwnerReminder(id) } }
    fun deleteOwnerReminder(id: String) { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.deleteOwnerReminder(id) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Reminder deleted."); loadOwnerReminders() }.onFailure { fail(it) } } }
    private fun reminderAction(action: suspend () -> Any) { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { action() }.onSuccess { _state.value = _state.value.copy(busy = false); loadOwnerReminders() }.onFailure { fail(it) } } }

    fun loadResidents() { viewModelScope.launch { runCatching { repository.allResidents() }.onSuccess { _state.value = _state.value.copy(residents = it) }.onFailure { fail(it) } } }
    fun loadUtilityCharges() { viewModelScope.launch {
        runCatching { repository.charges(limit = 100, kind = "UTILITY") }
            .onSuccess { _state.value = _state.value.copy(utilityCharges = it.charges) }
            .onFailure { _state.value = _state.value.copy(error = it.message ?: "Could not load utility billing history.") }
    } }
    fun loadMessages() { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.messages().messages }.onSuccess { _state.value = _state.value.copy(messages = it, busy = false) }.onFailure { fail(it) } } }
    fun prepareMessage(residentId: String, type: String, custom: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(messageBusy = true, error = null, notice = null, preparedMessage = null)
            runCatching { repository.prepareMessage(com.aashray.hospitality.data.PrepareMessageRequest(residentId, messageType = type, customMessage = custom)) }
                .onSuccess { _state.value = _state.value.copy(messageBusy = false, preparedMessage = it, notice = "Message preview prepared. It has not been sent.") }
                .onFailure { _state.value = _state.value.copy(messageBusy = false, error = it.message ?: "Could not prepare reminder.") }
        }
    }
    fun markMessageOpened(id: String) { viewModelScope.launch { runCatching { repository.markMessageOpened(id) }.onSuccess { loadMessages() }.onFailure { fail(it) } } }
    fun loadReport(name: String, from: String?, to: String?) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.report(name, from = from, to = to) }.onSuccess { _state.value = _state.value.copy(report = it, busy = false) }.onFailure { fail(it) } }
    }
    fun loadSettings() { viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.settings().settings }.onSuccess { _state.value = _state.value.copy(settings = it, busy = false) }.onFailure { fail(it) } } }
    fun saveSettings(settings: AppSettingsDto) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.updateSettings(settings) }.onSuccess { _state.value = _state.value.copy(settings = it.settings, busy = false, notice = "Workspace settings saved.") }.onFailure { fail(it) } }
    }
    fun addUtility(request: UtilityRequest) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.addUtility(request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Utility charge saved by the backend."); loadUtilityCharges() }.onFailure { fail(it) } }
    }
    fun loadDepositProfile(residentId: String) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.resident(residentId) }.onSuccess { _state.value = _state.value.copy(depositProfile = it, busy = false) }.onFailure { fail(it) } }
    }
    fun recordDeposit(request: DepositRequest) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.recordDeposit(request) }.onSuccess { result -> _state.value = _state.value.copy(busy = false, notice = "Deposit ledger updated. Current server balance: ₹${"%,.2f".format(java.util.Locale("en", "IN"), result.balancePaise / 100.0)}."); loadDepositProfile(request.residentId) }.onFailure { fail(it) } }
    }
    private fun fail(error: Throwable) { _state.value = _state.value.copy(busy = false, messageBusy = false, error = error.message ?: "The server request failed.") }
}
