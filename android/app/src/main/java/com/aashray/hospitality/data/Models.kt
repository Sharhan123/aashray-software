package com.aashray.hospitality.data

import com.google.gson.annotations.SerializedName
import com.google.gson.annotations.JsonAdapter
import com.google.gson.*
import java.lang.reflect.Type

data class UserDto(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
    val permissions: List<String> = emptyList(),
    val propertyIds: List<String> = emptyList(),
) {
    fun can(permission: String): Boolean = role == "SUPER_ADMIN" || permission in permissions
}

data class AuthResponse(val user: UserDto? = null)
data class CsrfResponse(val csrfToken: String = "")
data class LoginRequest(val email: String, val password: String)
data class ApiError(val error: String? = null)

data class DashboardResponse(
    val period: PeriodDto? = null,
    val metrics: DashboardMetricsDto? = null,
    val upcomingDues: List<UpcomingDueDto> = emptyList(),
    val recentPayments: List<RecentPaymentDto> = emptyList(),
    val recentAdmissions: List<RecentAdmissionDto> = emptyList(),
)

data class PeriodDto(val start: String? = null, val end: String? = null)
data class DashboardMetricsDto(
    val activeResidents: Int = 0,
    val totalBeds: Int = 0,
    val occupiedBeds: Int = 0,
    val availableBeds: Int = 0,
    val rentBilledPaise: Long = 0,
    val rentCollectedPaise: Long = 0,
    val outstandingRentPaise: Long = 0,
    val overdueRentPaise: Long = 0,
    val pendingUtilityPaise: Long = 0,
)

@JsonAdapter(DueResidentDtoAdapter::class)
data class DueResidentDto(val residentId: String? = null, val fullName: String? = null)

class DueResidentDtoAdapter : JsonDeserializer<DueResidentDto> {
    override fun deserialize(json: JsonElement, typeOfT: Type, context: JsonDeserializationContext): DueResidentDto? {
        if (json.isJsonNull) return null
        if (json.isJsonPrimitive) return DueResidentDto(residentId = json.asString)
        val obj = json.asJsonObject
        return DueResidentDto(
            residentId = obj.get("residentId")?.takeUnless(JsonElement::isJsonNull)?.asString
                ?: obj.get("_id")?.takeUnless(JsonElement::isJsonNull)?.asString,
            fullName = obj.get("fullName")?.takeUnless(JsonElement::isJsonNull)?.asString,
        )
    }
}
data class UpcomingDueDto(
    val _id: String? = null,
    val description: String? = null,
    val dueAt: String? = null,
    val amountPaise: Long = 0,
    val paidPaise: Long = 0,
    @SerializedName("residentId") val resident: DueResidentDto? = null,
)
data class RecentPaymentDto(
    val _id: String? = null,
    val paymentDate: String? = null,
    val amountPaise: Long = 0,
    val method: String? = null,
    @SerializedName("residentId") val resident: DueResidentDto? = null,
)
data class RecentAdmissionDto(val residentId: String? = null, val fullName: String? = null, val admissionDate: String? = null)

data class PropertyResponse(
    val properties: List<PropertyDto> = emptyList(),
    val unassignedRooms: Int = 0,
    val periodKey: String = "",
)
data class NewPropertyRequest(
    val name: String,
    val address: String = "",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val notes: String = "",
)
data class PropertyWriteResponse(val property: PropertyDto? = null)
data class PropertyDto(
    val _id: String = "",
    val name: String = "",
    val address: String = "",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val active: Boolean = true,
    val totalRooms: Int = 0,
    val totalBeds: Int = 0,
    val occupiedBeds: Int = 0,
    val vacantBeds: Int = 0,
    val activeResidents: Int = 0,
    val financials: PropertyFinancialsDto = PropertyFinancialsDto(),
)
data class PropertyFinancialsDto(
    val rentBilledPaise: Long = 0,
    val rentCollectedPaise: Long = 0,
    val rentOutstandingPaise: Long = 0,
    val utilityOutstandingPaise: Long = 0,
)

data class RoomResponse(val rooms: List<RoomDto> = emptyList())
data class RoomDto(
    val _id: String = "",
    val propertyId: String? = null,
    val propertyName: String? = null,
    val roomNumber: String = "",
    val roomType: String = "NON_AC",
    val capacity: Int = 0,
    val active: Boolean = true,
    val occupied: Int = 0,
    val available: Int = 0,
    val beds: List<BedDto> = emptyList(),
)
data class BedDto(val bedId: String = "", val active: Boolean = true)

data class ResidentListResponse(
    val residents: List<ResidentDto> = emptyList(),
    val page: Int = 1,
    val limit: Int = 20,
    val total: Int = 0,
    val pages: Int = 0,
)
data class ResidentDto(
    val _id: String = "",
    val residentId: String = "",
    val fullName: String = "",
    val mobile: String = "",
    val email: String = "",
    val status: String = "ACTIVE",
    val admissionDate: String? = null,
    val billingStartDate: String? = null,
    val currentAllocation: AllocationDto? = null,
    val outstandingPaise: Long = 0,
    val currentRentPaise: Long = 0,
    val emergencyContact: String = "",
    val governmentId: String = "",
    val notes: String = "",
    val rentSchedules: List<RentScheduleDto> = emptyList(),
)
data class RentScheduleDto(val monthlyRentPaise: Long = 0, val dueDay: Int = 5, val effectiveFrom: String? = null)
data class AllocationDto(
    val roomId: RoomReferenceDto? = null,
    val roomNumber: String? = null,
    val bedId: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
)
data class RoomReferenceDto(val _id: String? = null, val roomNumber: String? = null, val roomType: String? = null)
data class ResidentProfileResponse(
    val resident: ResidentDto? = null,
    val allocations: List<AllocationDto> = emptyList(),
    val deposits: List<DepositTransactionDto> = emptyList(),
    val outstandingPaise: Long = 0,
    val overduePaise: Long = 0,
    val pendingUtilityPaise: Long = 0,
    val depositBalancePaise: Long = 0,
)

data class ChargeListResponse(val charges: List<ChargeDto> = emptyList(), val page: Int = 1, val pages: Int = 0, val total: Int = 0)
data class ChargeDto(
    val _id: String = "",
    val residentId: DueResidentDto? = null,
    val kind: String = "",
    val utilityType: String = "",
    val description: String = "",
    val periodKey: String = "",
    val amountPaise: Long = 0,
    val paidPaise: Long = 0,
    val externalPaidPaise: Long = 0,
    val balancePaise: Long = 0,
    val dueAt: String? = null,
    val status: String = "PENDING",
)
data class BillingPreviewRequest(val periodKey: String, val propertyId: String? = null)
data class BillingPreviewResponse(
    val periodKey: String = "",
    val propertyId: String? = null,
    val candidates: List<BillingCandidateDto> = emptyList(),
    val summary: BillingSummaryDto = BillingSummaryDto(),
)
data class BillingCandidateDto(
    val residentRecordId: String = "",
    val residentId: String = "",
    val fullName: String = "",
    val roomNumber: String = "",
    val bedId: String = "",
    val dueAt: String? = null,
    val existing: Boolean = false,
    val eligible: Boolean = false,
    val exclusionReason: String = "",
    val proposedPaise: Long = 0,
)
data class BillingSummaryDto(
    val eligibleResidents: Int = 0,
    val newChargesToCreate: Int = 0,
    val existingChargesToSkip: Int = 0,
    val residentsExcluded: Int = 0,
    val totalAmountProposedPaise: Long = 0,
)
data class GenerateBillingRequest(val periodKey: String, val propertyId: String? = null, val confirmed: Boolean = true)
data class BillingGenerationResponse(val periodKey: String = "", val created: Int = 0, val skipped: Int = 0, val createdPaise: Long = 0)
data class PaymentListResponse(val payments: List<PaymentDto> = emptyList(), val page: Int = 1, val pages: Int = 0, val total: Int = 0)
data class PaymentDto(
    val _id: String = "",
    val residentId: DueResidentDto? = null,
    val amountPaise: Long = 0,
    val paymentDate: String? = null,
    val method: String = "",
    val reference: String = "",
    val allocations: List<PaymentAllocationDto> = emptyList(),
    val allocatedPaise: Long = 0,
    val unallocatedPaise: Long = 0,
    val allocationStatus: String = "",
    val reversedAt: String? = null,
)
data class PaymentAllocationDto(val chargeId: String = "", val amountPaise: Long = 0)
data class NewPaymentAllocation(val chargeId: String, val amount: Double)
data class NewPaymentRequest(
    val residentId: String,
    val propertyId: String? = null,
    val amount: Double,
    val paymentDate: String,
    val method: String,
    val reference: String = "",
    val notes: String = "",
    val allocations: List<NewPaymentAllocation> = emptyList(),
    val idempotencyKey: String,
)
data class PaymentResponse(val payment: PaymentDto? = null, val duplicate: Boolean = false)
data class ReceiptChargeDto(val kind: String = "", val utilityType: String = "", val periodKey: String = "", val description: String = "")
data class ReceiptBreakdownDto(val chargeId: String = "", val amountPaise: Long = 0, val charge: ReceiptChargeDto? = null)
data class ReceiptAllocationDto(
    @SerializedName("roomId") val room: ReceiptRoomDto? = null,
    val bedId: String = "",
)
data class ReceiptRoomDto(
    val roomNumber: String = "",
    @SerializedName("propertyId") val property: ReceiptPropertyDto? = null,
)
data class ReceiptPropertyDto(val name: String = "", val address: String = "")
data class ReceiptResponse(val payment: ReceiptPaymentDto = ReceiptPaymentDto(), val receiptNumber: String = "", val allocation: ReceiptAllocationDto? = null, val breakdown: List<ReceiptBreakdownDto> = emptyList())
data class ReceiptPaymentDto(
    @SerializedName("residentId") val resident: ReceiptResidentDto? = null,
    val amountPaise: Long = 0,
    val paymentDate: String? = null,
    val method: String = "",
    val reference: String = "",
    val notes: String = "",
    val reversedAt: String? = null,
)
data class ReceiptResidentDto(val residentId: String = "", val fullName: String = "", val mobile: String = "")
data class UtilityRequest(
    val residentId: String,
    val propertyId: String? = null,
    val utilityType: String,
    val periodKey: String,
    val amount: Double,
    val issuedAt: String,
    val dueAt: String,
    val notes: String = "",
    val idempotencyKey: String,
)
data class DepositRequest(val residentId: String, val amount: Double, val kind: String, val paymentMethod: String, val reference: String = "", val reason: String, val idempotencyKey: String)
data class MessageListResponse(val messages: List<MessageDto> = emptyList())
data class MessageDto(val _id: String = "", val recipient: String = "", val messageType: String = "", val message: String = "", val status: String = "", val createdAt: String? = null, @SerializedName("residentId") val resident: DueResidentDto? = null)
data class PrepareMessageRequest(val residentId: String, val propertyId: String? = null, val messageType: String, val customMessage: String = "")
data class PreparedMessageResponse(val message: MessageDto? = null, val whatsappUrl: String = "")
data class ReportResponse(val report: String = "", val rows: List<Map<String, Any?>> = emptyList(), val from: String? = null, val to: String? = null)
data class SettingsResponse(val settings: AppSettingsDto = AppSettingsDto())
data class AppSettingsDto(
    val businessName: String = "Aashray Hospitality",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val timezone: String = "Asia/Kolkata",
    val reminderOffsets: List<Int> = emptyList(),
    val paymentMethods: List<String> = emptyList(),
    val utilityTypes: List<String> = emptyList(),
    val rentReminderTemplate: String = "Hello {residentName}, there is a rent due of {amount} from Aashray Paying Guest for {month}. Please pay it within 5 days of the due date ({dueDate}). Thank you.",
    val whatsappPhoneNumberId: String = "",
    val whatsappBusinessAccountId: String = "",
    val whatsappAutoRemindersEnabled: Boolean = false,
    val whatsappConfigured: Boolean = false,
)
data class DepositTransactionDto(val _id: String = "", val amountPaise: Long = 0, val kind: String = "", val paymentMethod: String = "", val reference: String = "", val reason: String = "", val createdAt: String? = null)
data class DepositResponse(val transaction: DepositTransactionDto? = null, val balancePaise: Long = 0)
data class NewResidentRequest(
    val fullName: String,
    val mobile: String,
    val email: String = "",
    val governmentId: String = "",
    val emergencyContact: String = "",
    val admissionDate: String,
    val billingStartDate: String,
    val roomId: String,
    val bedId: String,
    val monthlyRent: Double,
    val dueDay: Int,
    val securityDeposit: Double = 0.0,
    val depositPaid: Double = 0.0,
    val depositMethod: String = "CASH",
    val notes: String = "",
    val idempotencyKey: String,
)
data class EditResidentRequest(
    val fullName: String,
    val mobile: String,
    val email: String = "",
    val emergencyContact: String = "",
    val governmentId: String = "",
    val notes: String = "",
    val monthlyRent: Double,
    val dueDay: Int,
    val effectiveFrom: String,
    val roomId: String,
    val bedId: String,
)
data class ResidentWriteResponse(val resident: ResidentDto? = null, val duplicate: Boolean = false)
data class RentPreviewResponse(val policy: String = "", val periodKey: String = "", val amountPaise: Long = 0, val dueAt: String? = null)
