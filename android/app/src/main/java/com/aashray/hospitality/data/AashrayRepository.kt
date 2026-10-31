package com.aashray.hospitality.data

import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import java.io.IOException

class ApiFailure(message: String, val statusCode: Int? = null, cause: Throwable? = null) : Exception(message, cause)

class AashrayRepository(
    private val api: ApiService,
    private val cookieJar: SessionCookieStore,
    private val gson: Gson = Gson(),
) {
    suspend fun login(email: String, password: String): UserDto = request {
        val csrf = api.csrf().csrfToken
        require(csrf.isNotBlank()) { "The server did not provide a request verification token." }
        api.login(csrf, LoginRequest(email.trim(), password)).user
            ?: throw ApiFailure("The server returned an incomplete account response.")
    }

    suspend fun currentUser(): UserDto = request {
        api.me().user ?: throw ApiFailure("The server returned an incomplete account response.")
    }

    suspend fun logout() = request {
        val csrf = api.csrf().csrfToken
        api.logout(csrf)
        cookieJar.clear()
    }

    fun clearSession() = cookieJar.clear()

    suspend fun dashboard() = request { api.dashboard() }
    suspend fun properties() = request { api.properties() }
    suspend fun createProperty(property: NewPropertyRequest) = request {
        api.createProperty(property).property ?: throw ApiFailure("The server did not return the created property.")
    }
    suspend fun updateProperty(id: String, property: NewPropertyRequest) = request {
        api.updateProperty(id, property).property ?: throw ApiFailure("The server did not return the updated property.")
    }
    suspend fun deactivateProperty(id: String) = request { api.deactivateProperty(id) }
    suspend fun deleteProperty(id: String, reason: String) = request { api.deleteProperty(id, PropertyDeleteRequest(reason)) }
    suspend fun rooms(propertyId: String? = null) = request { api.rooms(propertyId = propertyId) }
    suspend fun createRoom(room: RoomWriteRequest) = request { api.createRoom(room) }
    suspend fun updateRoom(id: String, room: RoomWriteRequest) = request { api.updateRoom(id, room) }
    suspend fun deactivateRoom(id: String) = request { api.deactivateRoom(id) }
    suspend fun residents(page: Int = 1, limit: Int = 30, search: String? = null, propertyId: String? = null, status: String? = null, rentPaymentStatus: String? = null, rentPeriod: String? = null, roomType: String? = null, roomId: String? = null, outstanding: String? = null, sort: String? = null, direction: String? = null) =
        request { api.residents(page, limit, search?.takeIf(String::isNotBlank), propertyId, status, rentPaymentStatus, rentPeriod, roomType, roomId, outstanding, sort, direction) }
    suspend fun allResidents(status: String? = null, propertyId: String? = null): List<ResidentDto> = request {
        val result = mutableListOf<ResidentDto>()
        var page = 1
        var pages = 1
        do {
            val response = api.residents(page = page, limit = 100, propertyId = propertyId, status = status)
            result += response.residents
            pages = response.pages.coerceAtLeast(page)
            page += 1
        } while (page <= pages && page <= 100 && result.isNotEmpty())
        result
    }
    suspend fun resident(id: String) = request { api.resident(id) }
    suspend fun checkoutResident(id: String, checkout: CheckoutRequest) = request { api.checkoutResident(id, checkout) }
    suspend fun refundCheckoutDeposit(id: String, checkoutId: String, refund: CheckoutRefundRequest) = request { api.refundCheckoutDeposit(id, checkoutId, refund) }
    suspend fun readmitResident(id: String, readmit: ReadmitRequest) = request { api.readmitResident(id, readmit) }
    suspend fun createResident(request: NewResidentRequest) = request { api.createResident(request) }
    suspend fun previewResidentImport(csv: String) = request { api.previewResidentImport(ResidentImportRequest(csv)) }
    suspend fun commitResidentImport(csv: String, previewId: String) = request { api.commitResidentImport(ResidentImportCommitRequest(csv, previewId)) }
    suspend fun updateResident(id: String, request: EditResidentRequest) = request { api.updateResident(id, request) }
    suspend fun previewResidentRent(id: String, billingStartDate: String, dueDay: Int, monthlyRent: Double) = request { api.previewResidentRent(id, billingStartDate, dueDay, monthlyRent) }
    suspend fun charges(page: Int = 1, limit: Int = 100, residentId: String? = null, propertyId: String? = null, kind: String? = null, status: String? = null) =
        request { api.charges(page, limit, residentId, propertyId, kind, status) }
    suspend fun previewBilling(periodKey: String, propertyId: String? = null) = request { api.billingPreview(BillingPreviewRequest(periodKey, propertyId)) }
    suspend fun generateBilling(periodKey: String, propertyId: String? = null) = request { api.generateBilling(GenerateBillingRequest(periodKey, propertyId, confirmed = true)) }
    suspend fun payments(page: Int = 1, limit: Int = 100, residentId: String? = null, propertyId: String? = null) =
        request { api.payments(page, limit, residentId, propertyId) }
    suspend fun paymentLedger(kind: String, propertyId: String? = null, from: String? = null, to: String? = null) =
        request { api.paymentLedger(kind, propertyId, from, to) }
    suspend fun recordPayment(payment: NewPaymentRequest) = request { api.recordPayment(payment) }
    suspend fun reversePayment(id: String, reason: String) = request { api.reversePayment(id, PaymentReverseRequest(reason)) }
    suspend fun receipt(paymentId: String) = request { api.receipt(paymentId) }
    suspend fun addUtility(utility: UtilityRequest) = request { api.addUtility(utility) }
    suspend fun recordDeposit(deposit: DepositRequest) = request { api.recordDeposit(deposit) }
    suspend fun messages(propertyId: String? = null) = request { api.messages(propertyId) }
    suspend fun prepareMessage(message: PrepareMessageRequest) = request { api.prepareMessage(message) }
    suspend fun markMessageOpened(id: String) = request { api.markMessageOpened(id) }
    suspend fun report(name: String, propertyId: String? = null, from: String? = null, to: String? = null) = request { api.report(name, propertyId, from, to) }
    suspend fun settings() = request { api.settings() }
    suspend fun updateSettings(settings: AppSettingsDto) = request { api.updateSettings(settings) }
    suspend fun ownerReminders() = request { api.ownerReminders() }
    suspend fun createOwnerReminder(reminder: OwnerReminderRequest) = request { api.createOwnerReminder(reminder) }
    suspend fun acknowledgeOwnerReminder(id: String) = request { api.acknowledgeOwnerReminder(id) }
    suspend fun snoozeOwnerReminder(id: String, minutes: Int) = request { api.snoozeOwnerReminder(id, SnoozeReminderRequest(minutes)) }
    suspend fun stopOwnerReminder(id: String) = request { api.stopOwnerReminder(id) }
    suspend fun deleteOwnerReminder(id: String) = request { api.deleteOwnerReminder(id) }
    suspend fun staff() = request { api.staff() }
    suspend fun createStaff(request: StaffCreateRequest) = request { api.createStaff(request) }
    suspend fun updateStaff(id: String, request: StaffUpdateRequest) = request { api.updateStaff(id, request) }
    suspend fun resetStaffPassword(id: String, password: String) = request { api.resetStaffPassword(id, StaffPasswordRequest(password)) }

    private suspend fun <T> request(block: suspend () -> T): T = try {
        block()
    } catch (error: CancellationException) {
        throw error
    } catch (error: HttpException) {
        val message = runCatching { gson.fromJson(error.response()?.errorBody()?.string(), ApiError::class.java)?.error }
            .getOrNull().orEmpty().ifBlank { "Request failed (${error.code()})." }
        if (error.code() == 401) cookieJar.clear()
        throw ApiFailure(message, error.code(), error)
    } catch (error: IOException) {
        throw ApiFailure("You appear to be offline. Check your connection and try again.", cause = error)
    } catch (error: IllegalArgumentException) {
        throw ApiFailure(error.message ?: "The server returned invalid data.", cause = error)
    }
}
