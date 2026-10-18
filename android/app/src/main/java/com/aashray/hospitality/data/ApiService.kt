package com.aashray.hospitality.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.PUT

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
    @GET("rooms") suspend fun rooms(
        @Query("propertyId") propertyId: String? = null,
        @Query("active") active: Boolean? = true,
    ): RoomResponse
    @GET("residents") suspend fun residents(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 30,
        @Query("search") search: String? = null,
        @Query("propertyId") propertyId: String? = null,
        @Query("status") status: String? = null,
        @Query("rentPaymentStatus") rentPaymentStatus: String? = null,
        @Query("rentPeriod") rentPeriod: String? = null,
    ): ResidentListResponse
    @GET("residents/{id}") suspend fun resident(@Path("id") id: String): ResidentProfileResponse
    @POST("residents") suspend fun createResident(@Body request: NewResidentRequest): ResidentWriteResponse
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
    @POST("payments") suspend fun recordPayment(@Body request: NewPaymentRequest): PaymentResponse
    @GET("payments/{id}/receipt") suspend fun receipt(@Path("id") paymentId: String): ReceiptResponse
    @POST("utilities") suspend fun addUtility(@Body request: UtilityRequest): Map<String, Any?>
    @POST("deposits") suspend fun recordDeposit(@Body request: DepositRequest): DepositResponse
    @GET("messages") suspend fun messages(@Query("propertyId") propertyId: String? = null): MessageListResponse
    @POST("messages/prepare") suspend fun prepareMessage(@Body request: PrepareMessageRequest): PreparedMessageResponse
    @POST("messages/{id}/opened") suspend fun markMessageOpened(@Path("id") id: String): Map<String, Any?>
    @GET("reports/{name}") suspend fun report(@Path("name") name: String, @Query("propertyId") propertyId: String? = null, @Query("from") from: String? = null, @Query("to") to: String? = null): ReportResponse
    @GET("settings") suspend fun settings(): SettingsResponse
    @PUT("settings") suspend fun updateSettings(@Body settings: AppSettingsDto): SettingsResponse
}
