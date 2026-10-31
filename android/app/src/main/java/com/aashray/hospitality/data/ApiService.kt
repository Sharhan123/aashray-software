package com.aashray.hospitality.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.PUT
import retrofit2.http.PATCH
import retrofit2.http.DELETE

interface ApiService {
    @GET("health") suspend fun health(): Map<String, String>

    @GET("auth/csrf") suspend fun csrf(): CsrfResponse
    @POST("auth/login") suspend fun login(
        @Header("X-CSRF-Token") csrfToken: String,
        @Body request: LoginRequest,
    ): AuthResponse
    @GET("auth/me") suspend fun me(): AuthResponse
    @POST("auth/logout") suspend fun logout(@Header("X-CSRF-Token") csrfToken: String)

    @GET("dashboard") suspend fun dashboard(): DashboardResponse
    @GET("properties") suspend fun properties(): PropertyResponse
    @POST("properties") suspend fun createProperty(@Body request: NewPropertyRequest): PropertyWriteResponse
    @PUT("properties/{id}") suspend fun updateProperty(@Path("id") id: String, @Body request: NewPropertyRequest): PropertyWriteResponse
    @PATCH("properties/{id}/deactivate") suspend fun deactivateProperty(@Path("id") id: String): Map<String, Any?>
    @DELETE("properties/{id}") suspend fun deleteProperty(@Path("id") id: String, @Body request: PropertyDeleteRequest): Map<String, Any?>
    @GET("rooms") suspend fun rooms(
        @Query("propertyId") propertyId: String? = null,
        @Query("active") active: Boolean? = true,
    ): RoomResponse
    @POST("rooms") suspend fun createRoom(@Body request: RoomWriteRequest): Map<String, Any?>
    @PUT("rooms/{id}") suspend fun updateRoom(@Path("id") id: String, @Body request: RoomWriteRequest): Map<String, Any?>
    @PATCH("rooms/{id}/deactivate") suspend fun deactivateRoom(@Path("id") id: String): Map<String, Any?>
    @GET("residents") suspend fun residents(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 30,
        @Query("search") search: String? = null,
        @Query("propertyId") propertyId: String? = null,
        @Query("status") status: String? = null,
        @Query("rentPaymentStatus") rentPaymentStatus: String? = null,
        @Query("rentPeriod") rentPeriod: String? = null,
        @Query("roomType") roomType: String? = null,
        @Query("roomId") roomId: String? = null,
        @Query("outstanding") outstanding: String? = null,
        @Query("sort") sort: String? = null,
        @Query("direction") direction: String? = null,
    ): ResidentListResponse
    @GET("residents/{id}") suspend fun resident(@Path("id") id: String): ResidentProfileResponse
    @POST("residents/{id}/checkout") suspend fun checkoutResident(@Path("id") id: String, @Body request: CheckoutRequest): CheckoutResponse
    @POST("residents/{id}/checkouts/{checkoutId}/refund") suspend fun refundCheckoutDeposit(@Path("id") residentId: String, @Path("checkoutId") checkoutId: String, @Body request: CheckoutRefundRequest): CheckoutRefundResponse
    @POST("residents/{id}/readmit") suspend fun readmitResident(@Path("id") id: String, @Body request: ReadmitRequest): Map<String, Any?>
    @POST("residents") suspend fun createResident(@Body request: NewResidentRequest): ResidentWriteResponse
    @POST("imports/residents/preview") suspend fun previewResidentImport(@Body request: ResidentImportRequest): ResidentImportPreviewDto
    @POST("imports/residents/commit") suspend fun commitResidentImport(@Body request: ResidentImportCommitRequest): ResidentImportCommitDto
    @PUT("residents/{id}") suspend fun updateResident(@Path("id") id: String, @Body request: EditResidentRequest): ResidentWriteResponse
    @GET("residents/{id}/preview-rent") suspend fun previewResidentRent(
        @Path("id") id: String,
        @Query("billingStartDate") billingStartDate: String,
        @Query("dueDay") dueDay: Int,
        @Query("monthlyRent") monthlyRent: Double,
    ): RentPreviewResponse

    @GET("charges") suspend fun charges(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
        @Query("residentId") residentId: String? = null,
        @Query("propertyId") propertyId: String? = null,
        @Query("kind") kind: String? = null,
        @Query("status") status: String? = null,
    ): ChargeListResponse
    @POST("billing/preview") suspend fun billingPreview(@Body request: BillingPreviewRequest): BillingPreviewResponse
    @POST("billing/generate") suspend fun generateBilling(@Body request: GenerateBillingRequest): BillingGenerationResponse
    @GET("payments") suspend fun payments(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
        @Query("residentId") residentId: String? = null,
        @Query("propertyId") propertyId: String? = null,
    ): PaymentListResponse
    @GET("payment-ledger/{kind}") suspend fun paymentLedger(
        @Path("kind") kind: String,
        @Query("propertyId") propertyId: String? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): PaymentLedgerResponse
    @POST("payments") suspend fun recordPayment(@Body request: NewPaymentRequest): PaymentResponse
    @POST("payments/{id}/reverse") suspend fun reversePayment(@Path("id") paymentId: String, @Body request: PaymentReverseRequest): Map<String, Any?>
    @GET("payments/{id}/receipt") suspend fun receipt(@Path("id") paymentId: String): ReceiptResponse
    @POST("utilities") suspend fun addUtility(@Body request: UtilityRequest): Map<String, Any?>
    @POST("deposits") suspend fun recordDeposit(@Body request: DepositRequest): DepositResponse
    @GET("messages") suspend fun messages(@Query("propertyId") propertyId: String? = null): MessageListResponse
    @POST("messages/prepare") suspend fun prepareMessage(@Body request: PrepareMessageRequest): PreparedMessageResponse
    @POST("messages/{id}/opened") suspend fun markMessageOpened(@Path("id") id: String): Map<String, Any?>
    @GET("reports/{name}") suspend fun report(@Path("name") name: String, @Query("propertyId") propertyId: String? = null, @Query("from") from: String? = null, @Query("to") to: String? = null): ReportResponse
    @GET("settings") suspend fun settings(): SettingsResponse
    @PUT("settings") suspend fun updateSettings(@Body settings: AppSettingsDto): SettingsResponse
    @GET("reminders") suspend fun ownerReminders(): OwnerReminderListResponse
    @POST("reminders") suspend fun createOwnerReminder(@Body request: OwnerReminderRequest): OwnerReminderResponse
    @POST("reminders/{id}/acknowledge") suspend fun acknowledgeOwnerReminder(@Path("id") id: String): OwnerReminderResponse
    @POST("reminders/{id}/snooze") suspend fun snoozeOwnerReminder(@Path("id") id: String, @Body request: SnoozeReminderRequest): OwnerReminderResponse
    @POST("reminders/{id}/stop") suspend fun stopOwnerReminder(@Path("id") id: String): OwnerReminderResponse
    @DELETE("reminders/{id}") suspend fun deleteOwnerReminder(@Path("id") id: String)
    @GET("staff") suspend fun staff(): StaffListResponse
    @POST("staff") suspend fun createStaff(@Body request: StaffCreateRequest): Map<String, Any?>
    @PATCH("staff/{id}") suspend fun updateStaff(@Path("id") id: String, @Body request: StaffUpdateRequest): Map<String, Any?>
    @POST("staff/{id}/reset-password") suspend fun resetStaffPassword(@Path("id") id: String, @Body request: StaffPasswordRequest): Map<String, Any?>
}
