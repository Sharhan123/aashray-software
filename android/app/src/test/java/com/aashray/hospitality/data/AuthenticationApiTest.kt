package com.aashray.hospitality.data

import com.google.gson.Gson
import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class AuthenticationApiTest {
    private lateinit var server: MockWebServer
    private lateinit var cookies: MemoryCookieJar
    private lateinit var cookieStore: TestCookieStore
    private lateinit var repository: AashrayRepository

    @Before
    fun setUp() {
        server = MockWebServer().apply { start() }
        cookies = MemoryCookieJar()
        cookieStore = TestCookieStore()
        val gson = Gson()
        val api = Retrofit.Builder()
            .baseUrl(server.url("api/"))
            .client(OkHttpClient.Builder().cookieJar(cookies).build())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(ApiService::class.java)
        repository = AashrayRepository(api, cookieStore, gson)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun loginFetchesCsrfTokenAndSendsItAlongWithTheServerSessionCookie() = runBlocking {
        // MockWebServer uses HTTP here; production cookies remain Secure over the HTTPS API base URL.
        server.enqueue(MockResponse().setHeader("Set-Cookie", "aashray_csrf=csrf-cookie; Path=/; HttpOnly")
            .setBody("{\"csrfToken\":\"csrf-token-123\"}"))
        server.enqueue(MockResponse().setHeader("Set-Cookie", "aashray_session=short-lived-session; Path=/; HttpOnly; Secure")
            .setBody("{\"user\":{\"id\":\"owner-1\",\"name\":\"Aashray Owner\",\"email\":\"owner@example.com\",\"role\":\"SUPER_ADMIN\",\"permissions\":[]}}"))

        val user = repository.login("  owner@example.com ", "correct-password")

        assertEquals("owner-1", user.id)
        assertEquals("SUPER_ADMIN", user.role)
        assertTrue(user.can("payments:write"))
        val csrfRequest = server.takeRequest()
        assertEquals("GET", csrfRequest.method)
        assertEquals("/api/auth/csrf", csrfRequest.path)
        val loginRequest = server.takeRequest()
        assertEquals("POST", loginRequest.method)
        assertEquals("/api/auth/login", loginRequest.path)
        assertEquals("csrf-token-123", loginRequest.getHeader("X-CSRF-Token"))
        assertTrue(loginRequest.getHeader("Cookie").orEmpty().contains("aashray_csrf=csrf-cookie"))
        assertEquals("owner@example.com", Gson().fromJson(loginRequest.body.readUtf8(), LoginRequest::class.java).email)
    }

    @Test
    fun unauthorizedSessionLookupClearsPersistedCredentials() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"error\":\"Session expired\"}"))

        val failure = runCatching { repository.currentUser() }.exceptionOrNull()

        assertEquals("Session expired", failure?.message)
        assertEquals(1, cookieStore.clearCount)
    }

    @Test
    fun staffPermissionsAreLimitedToPermissionsReturnedByTheBackend() {
        val staff = UserDto(role = "STAFF", permissions = listOf("residents:read"))

        assertTrue(staff.can("residents:read"))
        assertTrue(!staff.can("payments:write"))
        assertTrue(UserDto(role = "SUPER_ADMIN").can("payments:write"))
    }

    @Test
    fun messageResidentReferenceAcceptsBothIdStringAndPopulatedObject() {
        val gson = Gson()
        val stringReference = gson.fromJson(
            """{"message":{"_id":"message-1","residentId":"resident-id"}}""",
            PreparedMessageResponse::class.java,
        )
        val populatedReference = gson.fromJson(
            """{"message":{"_id":"message-2","residentId":{"_id":"mongo-id","residentId":"ASH-26-123456","fullName":"Asha Patel"}}}""",
            PreparedMessageResponse::class.java,
        )

        assertEquals("resident-id", stringReference.message?.resident?.residentId)
        assertEquals("ASH-26-123456", populatedReference.message?.resident?.residentId)
        assertEquals("Asha Patel", populatedReference.message?.resident?.fullName)
    }

    @Test
    fun paymentRequestCarriesOneIdempotencyKeyAndUsesRupeesAtTheApiBoundary() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"payment\":{\"_id\":\"payment-1\",\"amountPaise\":1500000,\"method\":\"UPI\"}}"))
        val key = "d15a46be-c5f7-46cd-a163-3aa1c702a023"
        val response = repository.recordPayment(NewPaymentRequest(
            residentId = "507f1f77bcf86cd799439011",
            amount = 15000.0,
            paymentDate = "2026-10-17",
            method = "UPI",
            allocations = listOf(NewPaymentAllocation("507f1f77bcf86cd799439012", 15000.0)),
            idempotencyKey = key,
        ))

        assertEquals("payment-1", response.payment?._id)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/payments", request.path)
        val json = Gson().fromJson(request.body.readUtf8(), NewPaymentRequest::class.java)
        assertEquals(15000.0, json.amount, 0.0)
        assertEquals(key, json.idempotencyKey)
        assertEquals(15000.0, json.allocations.single().amount, 0.0)
    }

    @Test
    fun residentAdmissionSendsSelectedPropertyRoomAndIdempotencyKeyToBackend() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"resident\":{\"_id\":\"resident-1\"}}"))
        val key = "0e896a43-ded2-490a-b194-b3a08c2410df"
        val requestBody = NewResidentRequest(
            fullName = "Asha Patel",
            mobile = "9876543210",
            email = "asha@example.com",
            governmentId = "",
            emergencyContact = "",
            admissionDate = "2026-10-17",
            billingStartDate = "2026-11-01",
            roomId = "room-1",
            bedId = "2",
            monthlyRent = 12500.0,
            dueDay = 5,
            securityDeposit = 10000.0,
            depositPaid = 5000.0,
            depositMethod = "UPI",
            notes = "",
            idempotencyKey = key,
        )

        val response = repository.createResident(requestBody)

        assertEquals("resident-1", response.resident?._id)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/residents", request.path)
        val json = Gson().fromJson(request.body.readUtf8(), NewResidentRequest::class.java)
        assertEquals("room-1", json.roomId)
        assertEquals("2", json.bedId)
        assertEquals("2026-11-01", json.billingStartDate)
        assertEquals(key, json.idempotencyKey)
    }

    @Test
    fun csrfInterceptorFetchesMatchingCookieAndHeaderBeforeUnsafeRequest() {
        server.enqueue(MockResponse()
            .setHeader("Set-Cookie", "aashray_csrf=matching-token; Path=/; HttpOnly")
            .setBody("{\"csrfToken\":\"matching-token\"}"))
        server.enqueue(MockResponse().setBody("{\"periodKey\":\"2026-10\"}"))
        val client = OkHttpClient.Builder()
            .cookieJar(cookies)
            .addInterceptor(CsrfTokenInterceptor(cookies, server.url("api/")))
            .build()

        client.newCall(Request.Builder()
            .url(server.url("api/billing/preview"))
            .post("{}".toRequestBody("application/json".toMediaType()))
            .build()).execute().use { response -> assertEquals(200, response.code) }

        val csrfRequest = server.takeRequest()
        assertEquals("GET", csrfRequest.method)
        assertEquals("/api/auth/csrf", csrfRequest.path)
        val protectedRequest = server.takeRequest()
        assertEquals("POST", protectedRequest.method)
        assertEquals("matching-token", protectedRequest.getHeader("X-CSRF-Token"))
        assertTrue(protectedRequest.getHeader("Cookie").orEmpty().contains("aashray_csrf=matching-token"))
    }

    private class TestCookieStore : SessionCookieStore {
        var clearCount = 0
        override fun clear() { clearCount++ }
    }

    private class MemoryCookieJar : CookieJar {
        private val saved = mutableListOf<Cookie>()
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            saved.removeAll { old -> cookies.any { it.name == old.name && it.domain == old.domain && it.path == old.path } }
            saved.addAll(cookies)
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> = saved.filter { it.matches(url) }
    }
}
