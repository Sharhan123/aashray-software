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
import com.aashray.hospitality.data.PropertyDto
import com.aashray.hospitality.data.PropertyResponse
import com.aashray.hospitality.data.NewPropertyRequest
import com.aashray.hospitality.data.ResidentDto
import com.aashray.hospitality.data.ResidentListResponse
import com.aashray.hospitality.data.ResidentProfileResponse
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
}

sealed interface PropertyCreateState {
    data object Idle : PropertyCreateState
    data object Saving : PropertyCreateState
    data object Created : PropertyCreateState
    data class Failed(val message: String) : PropertyCreateState
}

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
    private val _state = MutableStateFlow<LoadState<ResidentListResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<ResidentListResponse>> = _state.asStateFlow()
    private val _search = MutableStateFlow("")
    val search: StateFlow<String> = _search.asStateFlow()
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status.asStateFlow()
    private val _rentPaymentStatus = MutableStateFlow<String?>(null)
    val rentPaymentStatus: StateFlow<String?> = _rentPaymentStatus.asStateFlow()
    private val _loadingMore = MutableStateFlow(false)
    val loadingMore: StateFlow<Boolean> = _loadingMore.asStateFlow()
    private val _loadMoreError = MutableStateFlow<String?>(null)
    val loadMoreError: StateFlow<String?> = _loadMoreError.asStateFlow()
    private val _reminders = MutableStateFlow(ResidentReminderState())
    val reminders: StateFlow<ResidentReminderState> = _reminders.asStateFlow()
    private var searchJob: Job? = null
    private var page = 1
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
    init { refresh() }
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
        viewModelScope.launch { _state.value = load { repository.residents(page = 1, limit = 100, search = value, propertyId = propertyId, status = _status.value, rentPaymentStatus = _rentPaymentStatus.value, rentPeriod = period) } }
    }
    fun loadMore() {
        val current = (_state.value as? LoadState.Ready)?.value ?: return
        if (_loadingMore.value || page >= current.pages) return
        viewModelScope.launch {
            _loadingMore.value = true
            _loadMoreError.value = null
            val nextPage = page + 1
            runCatching { repository.residents(page = nextPage, limit = 100, search = _search.value, propertyId = propertyId, status = _status.value, rentPaymentStatus = _rentPaymentStatus.value, rentPeriod = java.time.YearMonth.now().toString()) }
                .onSuccess { result ->
                    page = nextPage
                    _state.value = LoadState.Ready(result.copy(residents = current.residents + result.residents))
                }
                .onFailure { _loadMoreError.value = it.message ?: "Could not load more residents." }
            _loadingMore.value = false
        }
    }
}

@HiltViewModel
class ResidentProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: AashrayRepository,
) : ViewModel() {
    private val residentId: String = checkNotNull(savedStateHandle["residentId"])
    private val _state = MutableStateFlow<LoadState<ResidentProfileResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<ResidentProfileResponse>> = _state.asStateFlow()
    init { refresh() }
    fun refresh() { viewModelScope.launch { _state.value = load { repository.resident(residentId) } } }
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
    val preview: BillingPreviewResponse? = null,
    val busy: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class BillingViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(BillingWorkspaceState())
    val state: StateFlow<BillingWorkspaceState> = _state.asStateFlow()
    private var previewJob: Job? = null
    init { viewModelScope.launch { runCatching { repository.properties().properties }.onSuccess { _state.value = _state.value.copy(properties = it) } } }
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
                .onSuccess { _state.value = _state.value.copy(busy = false, preview = null); onComplete(it) }
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
)

@HiltViewModel
class PaymentsViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PaymentsWorkspaceState())
    val state: StateFlow<PaymentsWorkspaceState> = _state.asStateFlow()
    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching {
                val residents = async { repository.residents(page = 1, limit = 100, status = "ACTIVE") }
                val payments = async { repository.payments(limit = 100) }
                residents.await().residents to payments.await().payments
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
                    result.payment?._id?.let { _state.value = _state.value.copy(receiptId = it) }
                }
                .onFailure { _state.value = _state.value.copy(busy = false, error = it.message ?: "Payment status is unknown. Refresh history before retrying.") }
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
)

@HiltViewModel
class OperationsViewModel @Inject constructor(private val repository: AashrayRepository) : ViewModel() {
    private val _state = MutableStateFlow(OperationsState())
    val state: StateFlow<OperationsState> = _state.asStateFlow()
    fun clearPrepared() { _state.value = _state.value.copy(preparedMessage = null) }

    fun loadResidents() { viewModelScope.launch { runCatching { repository.residents(limit = 100).residents }.onSuccess { _state.value = _state.value.copy(residents = it) }.onFailure { fail(it) } } }
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
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.addUtility(request) }.onSuccess { _state.value = _state.value.copy(busy = false, notice = "Utility charge saved by the backend.") }.onFailure { fail(it) } }
    }
    fun loadDepositProfile(residentId: String) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null); runCatching { repository.resident(residentId) }.onSuccess { _state.value = _state.value.copy(depositProfile = it, busy = false) }.onFailure { fail(it) } }
    }
    fun recordDeposit(request: DepositRequest) {
        viewModelScope.launch { _state.value = _state.value.copy(busy = true, error = null, notice = null); runCatching { repository.recordDeposit(request) }.onSuccess { result -> _state.value = _state.value.copy(busy = false, notice = "Deposit ledger updated. Current server balance: ₹${"%,.2f".format(java.util.Locale("en", "IN"), result.balancePaise / 100.0)}."); loadDepositProfile(request.residentId) }.onFailure { fail(it) } }
    }
    private fun fail(error: Throwable) { _state.value = _state.value.copy(busy = false, messageBusy = false, error = error.message ?: "The server request failed.") }
}
