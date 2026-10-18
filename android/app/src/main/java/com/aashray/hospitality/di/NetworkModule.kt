package com.aashray.hospitality.di

import android.content.Context
import com.aashray.hospitality.BuildConfig
import com.aashray.hospitality.data.ApiService
import com.aashray.hospitality.data.AashrayRepository
import com.aashray.hospitality.data.CsrfTokenInterceptor
import com.aashray.hospitality.data.SecureCookieJar
import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.HttpUrl.Companion.toHttpUrl
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun gson(): Gson = Gson()

    @Provides @Singleton fun cookieJar(@ApplicationContext context: Context) = SecureCookieJar(context)

    @Provides @Singleton fun okHttpClient(cookieJar: SecureCookieJar): OkHttpClient {
        val baseUrl = (if (BuildConfig.API_BASE_URL.endsWith('/')) BuildConfig.API_BASE_URL else "${BuildConfig.API_BASE_URL}/").toHttpUrl()
        return OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(CsrfTokenInterceptor(cookieJar, baseUrl))
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    @Provides @Singleton fun apiService(client: OkHttpClient, gson: Gson): ApiService {
        val baseUrl = BuildConfig.API_BASE_URL.let { if (it.endsWith('/')) it else "$it/" }
        return Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(GsonConverterFactory.create(gson)).build().create(ApiService::class.java)
    }

    @Provides @Singleton fun repository(api: ApiService, cookieJar: SecureCookieJar, gson: Gson) = AashrayRepository(api, cookieJar, gson)
}
