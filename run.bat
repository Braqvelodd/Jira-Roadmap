@echo off
if not exist JiraRoadmap.jar (
    echo JiraRoadmap.jar not found! Running build.bat first...
    call build.bat
)

rem Search for Java 8 JRE/JDK installation to use for launching
set JAVA8_EXE=
for /f "delims=" %%i in ('powershell -Command "(Get-ChildItem -Path 'C:\Program Files\Java', 'C:\Program Files (x86)\Java' -Filter java.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { & $_ -version 2>&1 | Select-String '1.8.' } | Select-Object -First 1).FullName"') do (
    set JAVA8_EXE=%%i
)

if "%JAVA8_EXE%"=="" (
    echo WARNING: Java 8 runtime with bundled JavaFX was not found in Program Files.
    echo Attempting to launch with system default java...
    java -jar JiraRoadmap.jar
) else (
    echo Found Java 8 runtime at: %JAVA8_EXE%
    echo Launching Jira Interactive Roadmap Dashboard...
    "%JAVA8_EXE%" -jar JiraRoadmap.jar
)
