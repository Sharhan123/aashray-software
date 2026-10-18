@echo off
set APP_HOME=%~dp0
if not defined JAVA_HOME set JAVA_HOME=java
"%JAVA_HOME%\bin\java.exe" -classpath "%APP_HOME%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
